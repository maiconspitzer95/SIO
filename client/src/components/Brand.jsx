import logoUrl from "../assets/santacasalogo.png";

export function Brand({ light = false, showText = true, className = "" }) {
  return (
    <div className={`brand ${light ? "light" : ""} ${className}`.trim()}>
      <span className="brand-icon" title="Santa Casa de Pelotas">
        <img
          src={logoUrl}
          alt="Logotipo da Santa Casa de Pelotas"
          className="brand-logo-img"
        />
      </span>
      {showText && (
        <div className="brand-text">
          <strong>Santa Casa</strong>
          <span>DE PELOTAS</span>
        </div>
      )}
    </div>
  );
}
