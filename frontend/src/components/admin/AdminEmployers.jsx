import React, { useCallback, useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaBuilding } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Platform-level employer management.
 *
 * The System Administrator verifies and suspends organizations but never
 * performs recruitment work inside them.
 */
const AdminEmployers = () => {
    const [employers, setEmployers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employers');
            setEmployers(res.data.employers || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load employers.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setStatus = async (employer, status) => {
        setBusyId(employer._id);
        try {
            await api.put(`/employers/${employer._id}/status`, { status });
            toast.success(`${employer.name} marked ${status}`);
            setEmployers(prev => prev.map(item =>
                item._id === employer._id ? { ...item, status } : item));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update organization');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading employers…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <Card className="p-3">
            <SectionHeader
                title="Employers"
                description="Organizations registered on the platform. Activate an organization to let it publish vacancies."
            />

            {employers.length === 0 ? (
                <EmptyState icon={FaBuilding} title="No employers registered"
                            description="Organizations appear here when an employer account signs up." />
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                <th className="fw-semibold">Organization</th>
                                <th className="fw-semibold">Owner</th>
                                <th className="fw-semibold">Industry</th>
                                <th className="fw-semibold">Status</th>
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employers.map(employer => (
                                <tr key={employer._id}>
                                    <td>
                                        <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>
                                            {employer.name}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                            Registered {new Date(employer.createdAt).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                        {employer.owner?.name || '—'}
                                        <div style={{ fontSize: '0.72rem' }}>{employer.owner?.email}</div>
                                    </td>
                                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                        {employer.industry || '—'}
                                    </td>
                                    <td><StatusBadge status={employer.status} /></td>
                                    <td className="text-end">
                                        <div className="d-flex gap-2 justify-content-end">
                                            {employer.status !== 'active' && (
                                                <Button size="sm" variant="success" disabled={busyId === employer._id}
                                                        onClick={() => setStatus(employer, 'active')}>
                                                    Activate
                                                </Button>
                                            )}
                                            {employer.status !== 'suspended' && (
                                                <Button size="sm" variant="outline-danger" disabled={busyId === employer._id}
                                                        onClick={() => setStatus(employer, 'suspended')}>
                                                    Suspend
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default AdminEmployers;
