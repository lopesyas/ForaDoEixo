import { useRef, useState, type FormEvent } from 'react';
import { OrderTotals } from '../components/Cart/OrderTotals';
import { StepsBar } from '../components/Cart/StepsBar';
import { Dock } from '../components/Dock/Dock';
import { FormField } from '../components/Form/FormField';
import { useCart, type Payment, type Shipping } from '../cart/CartProvider';
import { copy } from '../copy';

export type Step = 'endereco' | 'entrega' | 'pagamento';
const ORDER: Step[] = ['endereco', 'entrega', 'pagamento'];

export const digitsOnly = (value: string) => value.replace(/\D/g, '');
export const isValidCep = (value: string) => digitsOnly(value).length === 8;

function formatCep(value: string) {
  const d = digitsOnly(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

interface Props {
  step: Step;
  onStep: (step: Step) => void;
  onBackToCart: () => void;
  onDone: () => void;
}

export function CheckoutPage({ step, onStep, onBackToCart, onDone }: Props) {
  const { checkout, updateCheckout, placeOrder } = useCart();
  const t = copy.checkout;
  const index = ORDER.indexOf(step);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  function fail(next: Record<string, string>) {
    setErrors(next);
    // Leva o foco ao primeiro problema: quem usa teclado ou leitor de tela não precisa procurar.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (step === 'endereco') {
      if (!isValidCep(checkout.cep)) next.cep = t.address.cepError;
      if (!checkout.number.trim()) next.number = t.address.numberError;
    }
    if (step === 'entrega' && !checkout.shipping) next.shipping = t.delivery.error;
    if (step === 'pagamento' && !checkout.payment) next.payment = t.payment.error;
    if (Object.keys(next).length > 0) return fail(next);

    setErrors({});
    if (step === 'pagamento') {
      placeOrder();
      onDone();
    } else {
      onStep(ORDER[index + 1]!);
    }
  }

  const goBack = () => (index === 0 ? onBackToCart() : onStep(ORDER[index - 1]!));

  return (
    <>
      <div className="checkout">
        <form ref={formRef} className="checkout__main" onSubmit={submit} noValidate>
          <StepsBar current={(index + 1) as 1 | 2 | 3} />

          {step === 'endereco' && (
            <>
              <h1>{t.address.title}</h1>
              <FormField
                id="cep"
                label={t.address.cep}
                hint={t.address.cepHint}
                error={errors.cep}
                inputMode="numeric"
                autoComplete="postal-code"
                value={checkout.cep}
                onChange={(e) => updateCheckout({ cep: formatCep(e.target.value) })}
              />
              <FormField
                id="number"
                label={t.address.number}
                hint={t.address.numberHint}
                error={errors.number}
                autoComplete="off"
                value={checkout.number}
                onChange={(e) => updateCheckout({ number: e.target.value })}
              />
              <FormField
                id="complement"
                label={t.address.complement}
                hint={t.address.complementHint}
                autoComplete="off"
                value={checkout.complement}
                onChange={(e) => updateCheckout({ complement: e.target.value })}
              />
            </>
          )}

          {step === 'entrega' && (
            <>
              <h1>{t.delivery.title}</h1>
              <ChoiceGroup<Shipping>
                legend={t.delivery.title}
                error={errors.shipping}
                value={checkout.shipping}
                onChange={(shipping) => updateCheckout({ shipping })}
                options={[
                  { value: 'home', label: t.delivery.home, note: t.delivery.homeNote },
                  { value: 'pickup', label: t.delivery.pickup, note: t.delivery.pickupNote },
                ]}
              />
            </>
          )}

          {step === 'pagamento' && (
            <>
              <h1>{t.payment.title}</h1>
              <ChoiceGroup<Payment>
                legend={t.payment.title}
                error={errors.payment}
                value={checkout.payment}
                onChange={(payment) => updateCheckout({ payment })}
                options={[
                  { value: 'pix', label: t.payment.pix },
                  { value: 'card', label: t.payment.card },
                  { value: 'boleto', label: t.payment.boleto },
                ]}
              />
              <p className="status">{t.payment.note}</p>
            </>
          )}

          <div className="checkout__actions">
            <button type="submit" className="btn btn--primary btn--block">
              {step === 'pagamento' ? t.payment.finish : copy.cart.next}
            </button>
            <button type="button" className="link-btn" onClick={goBack}>
              {copy.cart.back}
            </button>
          </div>
        </form>
        <div className="checkout__side">
          <OrderTotals />
        </div>
      </div>
      <Dock />
    </>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  value: T | null;
  error?: string;
  onChange: (value: T) => void;
  options: { value: T; label: string; note?: string }[];
}

function ChoiceGroup<T extends string>({ legend, value, error, onChange, options }: ChoiceProps<T>) {
  return (
    <fieldset className="multi" aria-describedby={error ? 'choice-error' : undefined}>
      <legend className="visually-hidden">{legend}</legend>
      <div className="stack">
        {options.map((o, i) => (
          <label key={o.value} className={`choice choice--radio${value === o.value ? ' choice--on' : ''}`}>
            <input type="radio" name="choice" checked={value === o.value} onChange={() => onChange(o.value)} data-invalid={error && i === 0 ? 'true' : undefined} />
            <span className="choice__body">
              <span>{o.label}</span>
              {o.note && <small className="choice__note">{o.note}</small>}
            </span>
          </label>
        ))}
      </div>
      <p id="choice-error" className="form-field__error" aria-live="polite">
        {error ? `⚠ ${error}` : ''}
      </p>
    </fieldset>
  );
}
