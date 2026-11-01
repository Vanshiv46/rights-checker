import { useTranslation } from 'react-i18next';

interface Props {
  document: string;
  checked: boolean;
  onChange: () => void;
}

export function ChecklistItem({ document, checked, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-2 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ink ${checked ? 'border-brand bg-brand-tint' : 'border-line bg-white'}`}
    >
      <input
        type="checkbox"
        className="size-6 shrink-0 accent-brand"
        checked={checked}
        onChange={onChange}
      />
      <span className={checked ? 'text-ink-soft line-through' : ''}>
        {t(`documents.${document}`, { defaultValue: document })}
      </span>
    </label>
  );
}
