import type { CSSProperties } from 'react';
import type { ModelProvider } from '../types';

interface ProviderIconProps {
  provider: ModelProvider;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function OpenAIIcon({ size = 16, className, style }: Omit<ProviderIconProps, 'provider'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.1c1.84-1.06 4.18-.43 5.24 1.41l.86 1.49a3.93 3.93 0 0 1 3.84 1.93 3.92 3.92 0 0 1-.7 4.83 3.92 3.92 0 0 1-.46 4.88 3.92 3.92 0 0 1-4.82.78l-1.5.87a3.93 3.93 0 0 1-5.3-1.44 3.92 3.92 0 0 1-4.82-.8 3.92 3.92 0 0 1-.44-4.84 3.92 3.92 0 0 1-.73-4.84 3.92 3.92 0 0 1 3.86-1.94l.86-1.49A3.93 3.93 0 0 1 12 4.1Z" />
        <path d="M9.4 8.1 14.7 5" />
        <path d="M14.9 8.2h6" />
        <path d="m14.9 15.8 2.7 4.7" />
        <path d="m9.3 19-5.2-3.1" />
        <path d="M3.9 9.4 6.7 14" />
        <path d="M9.1 8.2h5.8l2.9 5-2.9 5H9.1l-2.9-5 2.9-5Z" />
      </g>
    </svg>
  );
}

function AnthropicIcon({ size = 16, className, style }: Omit<ProviderIconProps, 'provider'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#d97745" />
      <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 6.5v11" />
        <path d="M6.5 12h11" />
        <path d="m8.35 8.35 7.3 7.3" />
        <path d="m15.65 8.35-7.3 7.3" />
      </g>
    </svg>
  );
}

function OllamaIcon({ size = 16, className, style }: Omit<ProviderIconProps, 'provider'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.2 18.25v-4.55c0-2.55 1.78-4.45 4.2-4.45h1.3c1.03 0 1.86-.37 2.43-1.07l1.17-1.45 1.45 1.14-1.02 1.31a4.9 4.9 0 0 1-.92.9 4.53 4.53 0 0 1 2.9 4.34v3.83" />
        <path d="M10.42 8.88 9.33 6.2 7.86 7.88" />
        <path d="m14.06 8.75.77-2.52 1.84 1.25" />
        <path d="M11.45 13.03h.01" />
        <path d="M14.62 13.03h.01" />
        <path d="M12.38 15.12c.38.31.77.47 1.17.47s.79-.16 1.17-.47" />
        <path d="M10.12 18.25V15.7" />
        <path d="M13.95 18.25V15.7" />
        <path d="M17.78 18.25v-2.52" />
      </g>
    </svg>
  );
}

export function ProviderIcon({ provider, size = 16, className, style }: ProviderIconProps) {
  if (provider === 'openai') {
    return <OpenAIIcon size={size} className={className} style={style} />;
  }

  if (provider === 'anthropic') {
    return <AnthropicIcon size={size} className={className} style={style} />;
  }

  return <OllamaIcon size={size} className={className} style={style} />;
}
