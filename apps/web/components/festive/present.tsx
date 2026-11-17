/** A wrapped present drawn in CSS: plaid paper, gold ribbon and bow. Used by the reveal and as decoration. */
export function Present({ size = "md", children }: { size?: "sm" | "md"; children?: React.ReactNode }) {
  return (
    <span className={`present present-${size}`} aria-hidden="true">
      {children}
      <span className="present-box">
        <span className="present-ribbon" />
      </span>
      <span className="present-lid">
        <span className="present-bow">
          <i />
        </span>
      </span>
    </span>
  );
}
