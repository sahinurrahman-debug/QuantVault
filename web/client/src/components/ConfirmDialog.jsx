import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

/** `const confirm = useConfirm(); if (await confirm({ title, text, confirmLabel, danger })) ...` */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const dialogRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ options, resolve })), []);
  const close = (answer) => { request?.resolve(answer); setRequest(null); };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (request && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    if (!request && d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
  }, [request]);

  const o = request?.options || {};
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* A native <dialog>: focus is trapped, Escape cancels, and the page behind is inert. */}
      <dialog ref={dialogRef} className="confirm" aria-labelledby="confirm-title"
        onCancel={(e) => { e.preventDefault(); close(false); }}
        onClick={(e) => { if (e.target === dialogRef.current) close(false); }}>
        {request && (
          <div className="confirm-body">
            <h2 id="confirm-title">{o.title}</h2>
            {o.text && <p>{o.text}</p>}
            <div className="row-actions">
              <button className={`btn ${o.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>{o.confirmLabel || 'Confirm'}</button>
              <button className="btn" onClick={() => close(false)}>Cancel</button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
