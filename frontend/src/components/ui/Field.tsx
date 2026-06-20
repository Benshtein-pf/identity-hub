import type { InputHTMLAttributes, ReactElement, TextareaHTMLAttributes } from "react";

interface BaseFieldProps {
  label: string;
  error?: string;
  hint?: string;
  id?: string;
}

export interface InputFieldProps
  extends BaseFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  as?: never;
}

export interface TextareaFieldProps
  extends BaseFieldProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  as: "textarea";
}

const inputBase =
  "block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed " +
  "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 " +
  "disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400";

const inputNormal =
  `${inputBase} border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400`;
const inputError =
  `${inputBase} border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500 dark:focus:ring-red-400`;

function FieldMeta({
  label,
  id,
  error,
  hint
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
}) {
  return (
    <>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </>
  );
}

export function Field(props: InputFieldProps): ReactElement;
export function Field(props: TextareaFieldProps): ReactElement;
export function Field(props: InputFieldProps | TextareaFieldProps): ReactElement {
  if (props.as === "textarea") {
    const { label, error, hint, id: idProp, as: _as, ...rest } = props;
    const id = idProp ?? label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1">
        <FieldMeta label={label} id={id} error={error} hint={hint} />
        <textarea
          id={id}
          className={`${error ? inputError : inputNormal} resize-none`}
          rows={4}
          {...rest}
        />
      </div>
    );
  }

  const { label, error, hint, id: idProp, as: _as, ...rest } = props;
  const id = idProp ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1">
      <FieldMeta label={label} id={id} error={error} hint={hint} />
      <input id={id} className={error ? inputError : inputNormal} {...rest} />
    </div>
  );
}
