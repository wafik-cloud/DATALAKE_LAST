interface InrhBrandProps {
  variant?: 'sidebar' | 'login' | 'compact';
  showSubtitle?: boolean;
  title?: string;
  subtitle?: string;
}

export default function InrhBrand({
  variant = 'sidebar',
  showSubtitle = true,
  title = 'DATALAKE',
  subtitle = 'Plateforme de données halieutiques',
}: InrhBrandProps) {
  const isLogin = variant === 'login';
  const isCompact = variant === 'compact';

  return (
    <div className={`inrh-brand inrh-brand-${variant}`}>
      <div className="inrh-logo-wrap">
        <img
          src="/inrh-logo.svg"
          alt="Logo INRH — Institut National de Recherche Halieutique"
          className="inrh-logo"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = '1';
              img.src = '/inrh-logo.png';
            }
          }}
        />
      </div>
      {!isCompact && (
        <div className="inrh-brand-text">
          <p className="inrh-org">Institut National de Recherche Halieutique</p>
          <div className="brand">
            {title} <span>ADMIN</span>
          </div>
          {showSubtitle && (
            <p className="brand-sub">
              {isLogin ? 'Administration institutionnelle — INRH' : subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
