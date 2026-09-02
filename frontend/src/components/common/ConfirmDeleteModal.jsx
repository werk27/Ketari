import React from 'react';
import { Modal, Button } from 'react-bootstrap';

/**
 * Reusable Delete/Remove confirmation dialog, shared across the whole
 * platform (candidate, admin, employer/HR workspace areas) instead of each
 * module rolling its own. Replaces every browser-native window.confirm()
 * previously used for destructive actions, matching the design already
 * established by hr-expert/VacancyList.jsx's inline Modal.
 *
 * Only for genuine Delete/Remove actions - Update-style confirmations
 * (activate/deactivate, role assignment, revoke, etc.) are unaffected and
 * keep their existing behaviour.
 *
 * Safety properties:
 *   - Cancel closes the dialog and performs no API request.
 *   - Clicking the backdrop or pressing Escape behaves exactly like Cancel,
 *     never like Confirm - so a stray click can never delete anything.
 *   - While `busy` (the delete request is in flight), the dialog cannot be
 *     dismissed and both buttons are disabled, preventing double-submission.
 */
const ConfirmDeleteModal = ({
    show,
    title = 'Delete this record?',
    itemName,
    description = 'This action cannot be undone.',
    confirmLabel = 'Delete',
    busyLabel = 'Deleting…',
    variant = 'danger',
    busy = false,
    onCancel,
    onConfirm
}) => (
    <Modal show={show} onHide={busy ? undefined : onCancel} centered
           backdrop={busy ? 'static' : true} keyboard={!busy}>
        <Modal.Header closeButton={!busy}>
            <Modal.Title style={{ fontSize: '1.05rem' }}>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>
                {itemName && (
                    <>Are you sure you want to delete <span className="fw-semibold text-dark">"{itemName}"</span>?{' '}</>
                )}
                {description}
            </p>
        </Modal.Body>
        <Modal.Footer>
            <Button variant="light" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button variant={variant} onClick={onConfirm} disabled={busy}>
                {busy ? busyLabel : confirmLabel}
            </Button>
        </Modal.Footer>
    </Modal>
);

export default ConfirmDeleteModal;
