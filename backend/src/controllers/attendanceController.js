const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

/**
 * Attendance (spec §17).
 *
 * Deliberately kept at project scope: records, self check-in/out and reporting.
 * The service boundary is designed so an external time-attendance device or HR
 * system can post records through the same API without schema changes.
 *
 * Attendance applies to EMPLOYEES of an organization. An earlier version tracked
 * candidate "job seeker" attendance, which does not model anything real -
 * candidates are applicants, not staff who clock in.
 */

const startOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

/** Resolve (or create) the employee record backing the signed-in user. */
const resolveEmployeeForUser = async (user) => {
    let employee = await Employee.findOne({ user: user.id });
    if (employee) return employee;

    if (!user.employer) return null;

    const count = await Employee.countDocuments({ employer: user.employer });
    const [firstName, ...rest] = (user.name || 'Employee').split(' ');

    return Employee.create({
        user: user.id,
        employer: user.employer,
        employeeId: `EMP${String(count + 1).padStart(4, '0')}`,
        personalInfo: { firstName: firstName || 'Employee', lastName: rest.join(' ') || '-' },
        contactInfo: { email: user.email || '' },
        employmentInfo: { employmentStatus: 'active', hireDate: new Date() }
    });
};

const summarise = (records) => ({
    present: records.filter(a => a.status === 'present').length,
    absent: records.filter(a => a.status === 'absent').length,
    late: records.filter(a => a.status === 'late').length,
    leave: records.filter(a => a.status === 'leave' || a.status === 'holiday').length,
    total: records.length
});

// @desc    Check in
// @route   POST /api/attendance/check-in
// @access  Private (organization members)
exports.checkIn = async (req, res) => {
    try {
        const employee = await resolveEmployeeForUser(req.user);
        if (!employee) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not linked to an organization'
            });
        }

        const existing = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: startOfToday() }
        });

        if (existing && existing.checkIn && existing.checkIn.time) {
            return res.status(400).json({ success: false, message: 'Already checked in today' });
        }

        const record = existing || new Attendance({
            employee: employee._id,
            employer: employee.employer,
            date: new Date()
        });

        record.employer = employee.employer;
        record.checkIn = {
            time: new Date(),
            method: req.body.method || 'web',
            location: req.body.location
        };
        record.status = 'present';
        await record.save();

        res.status(200).json({ success: true, data: record, message: 'Checked in successfully' });
    } catch (error) {
        console.error('Check In Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Check out
// @route   POST /api/attendance/check-out
// @access  Private (organization members)
exports.checkOut = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'No employee record found. Please check in first.'
            });
        }

        const attendance = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: startOfToday() }
        });

        if (!attendance || !attendance.checkIn?.time) {
            return res.status(404).json({ success: false, message: 'No check-in found for today' });
        }

        if (attendance.checkOut && attendance.checkOut.time) {
            return res.status(400).json({ success: false, message: 'Already checked out' });
        }

        attendance.checkOut = {
            time: new Date(),
            method: req.body.method || 'web',
            location: req.body.location
        };

        const hours = (new Date(attendance.checkOut.time) - new Date(attendance.checkIn.time)) / (1000 * 60 * 60);
        attendance.hoursWorked = Math.round(hours * 10) / 10;
        await attendance.save();

        res.status(200).json({ success: true, data: attendance, message: 'Checked out successfully' });
    } catch (error) {
        console.error('Check Out Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The signed-in user's own attendance
// @route   GET /api/attendance/me
// @access  Private
exports.getMyAttendance = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });

        if (!employee) {
            return res.status(200).json({
                success: true,
                data: [],
                stats: { present: 0, absent: 0, late: 0, leave: 0, total: 0 },
                today: { checkedIn: false, checkedOut: false, status: 'not_started', record: null }
            });
        }

        const { startDate, endDate } = req.query;
        const query = { employee: employee._id };
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const attendances = await Attendance.find(query).sort({ date: -1 });

        const today = startOfToday();
        const todayRecord = attendances.find(a => {
            const date = new Date(a.date);
            date.setHours(0, 0, 0, 0);
            return date.getTime() === today.getTime();
        });

        res.status(200).json({
            success: true,
            data: attendances,
            stats: summarise(attendances),
            today: {
                checkedIn: !!todayRecord?.checkIn?.time,
                checkedOut: !!todayRecord?.checkOut?.time,
                status: todayRecord?.status || 'not_started',
                record: todayRecord || null
            }
        });
    } catch (error) {
        console.error('Get My Attendance Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Organization attendance report
// @route   GET /api/attendance/report
// @access  Private (attendance:view)
exports.getAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, employeeId } = req.query;

        const query = { employer: req.employerId };
        if (employeeId) query.employee = employeeId;
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const attendances = await Attendance.find(query)
            .populate('employee', 'employeeId personalInfo')
            .sort({ date: -1 });

        const today = startOfToday();
        const todayRecords = attendances.filter(a => {
            const date = new Date(a.date);
            date.setHours(0, 0, 0, 0);
            return date.getTime() === today.getTime();
        });

        res.status(200).json({
            success: true,
            data: attendances,
            stats: summarise(attendances),
            today: summarise(todayRecords)
        });
    } catch (error) {
        console.error('Get Attendance Report Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Record attendance on behalf of an employee
// @route   POST /api/attendance/record
// @access  Private (HR Expert)
//
// This is also the integration point for an external time-attendance device:
// posting the same payload from a device or in-house system needs no changes.
exports.recordAttendance = async (req, res) => {
    try {
        const { employeeId, date, status, checkIn, checkOut, note } = req.body;

        if (!employeeId || !date || !status) {
            return res.status(400).json({
                success: false,
                message: 'Employee, date and status are required'
            });
        }

        const employee = await Employee.findById(employeeId);
        const sameOrg = employee && employee.employer
            && employee.employer.toString() === req.employerId.toString();

        if (!sameOrg) {
            return res.status(403).json({
                success: false,
                message: 'This employee belongs to another organization'
            });
        }

        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);

        // One record per employee per day; re-posting updates it.
        let record = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: day, $lt: nextDay }
        });

        if (!record) {
            record = new Attendance({ employee: employee._id, date: new Date(date) });
        }

        record.employer = employee.employer;
        record.status = status;
        if (checkIn) record.checkIn = checkIn;
        if (checkOut) record.checkOut = checkOut;
        if (note !== undefined) record.note = note;

        if (record.checkIn?.time && record.checkOut?.time) {
            const hours = (new Date(record.checkOut.time) - new Date(record.checkIn.time)) / (1000 * 60 * 60);
            record.hoursWorked = Math.round(hours * 10) / 10;
        }

        await record.save();

        res.status(200).json({ success: true, data: record });
    } catch (error) {
        console.error('Record Attendance Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
