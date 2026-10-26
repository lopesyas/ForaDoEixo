import { ImageSlot } from '../components/ImageSlot/ImageSlot';
import { hasCategoryPhotos, hasProductPhotos } from '../components/ImageSlot/images';
import { Logo } from '../components/Logo/Logo';
import { copy } from '../copy';

const COLUMNS: { title: string; items: string[] }[] = [
  { title: 'Serviços', items: ['Cliente Ouro', 'Clinic Farma', 'Manipulação', 'Assinaturas', 'Clique e Retire', 'Remédios para Emagrecer', 'Remédios para Ressaca'] },
  { title: 'Sobre', items: ['Institucional', 'Nossas Lojas', 'Minha Pague Menos', 'Parceiros', 'Investidores', 'Trabalhe Conosco', 'Mapa do site'] },
  { title: 'Acessos', items: ['Minha conta'] },
  { title: 'Privacidade', items: ['Aviso de privacidade', 'Políticas', 'Promoções', 'Regulamentos'] },
];

export function SiteFooter({ onAsk }: { onAsk: (shown: string, actionId: string) => void }) {
  const t = copy.store;
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="help-banner">
          <div className="help-banner__text">
            <h2>{t.helpTitle}</h2>
            <p>{t.helpText}</p>
            <button type="button" className="btn help-banner__btn" onClick={() => onAsk(copy.humanHelp, 'handoff')}>
              {t.helpButton}
            </button>
          </div>
          <ImageSlot slot="help-agent" alt="Atendente da central de ajuda sorrindo, de headset" ratio="431 / 405" className="help-banner__img" />
        </div>

        <div className="shortcuts">
          <div className="shortcut">
            <strong>{t.whatsapp.title}</strong>
            <span>{t.whatsapp.text}</span>
          </div>
          <div className="shortcut">
            <strong>{t.stores.title}</strong>
            <span>{t.stores.text}</span>
          </div>
        </div>

        <div className="footer-cols">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h3>{c.title}</h3>
              <ul>
                {c.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3>Atendimento</h3>
            <ul>
              <li>Central de Atendimento 0800 275 1313</li>
              <li>FAQ</li>
            </ul>
            <h3>Formas de Pagamento</h3>
            <ul>
              <li>Sobre parcelamentos</li>
              <li>Visa · Mastercard · Elo · Pix</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <Logo />
        </div>
        <p className="footer-legal">
          {t.footerDemo}
          {hasCategoryPhotos() && ` ${t.illustrativeNote}`}
          {hasProductPhotos() && ` ${t.photosCredit}`}
        </p>
      </div>
    </footer>
  );
}
