export function PersonWithPhoneIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 340"
      className={className}
      role="img"
      aria-label="Illustration of a person smiling while holding up a phone"
    >
      {/* Decorative backdrop */}
      <circle cx="160" cy="165" r="150" fill="#ffffff" opacity="0.07" />
      <circle cx="262" cy="60" r="16" fill="#F5D67E" opacity="0.7" />
      <circle cx="46" cy="235" r="10" fill="#ffffff" opacity="0.25" />

      {/* Shoulders / top */}
      <path
        d="M40 340 C40 255 92 222 160 222 C228 222 280 255 280 340 Z"
        fill="#ffffff"
      />

      {/* Neck */}
      <rect x="140" y="188" width="40" height="42" rx="14" fill="#E9B486" />

      {/* Raised arm holding phone */}
      <path
        d="M198 300 C214 268 214 224 196 190 C190 179 200 168 211 174 C234 212 236 264 220 308 Z"
        fill="#ffffff"
      />

      {/* Phone */}
      <g transform="rotate(-14 214 152)">
        <rect x="188" y="104" width="52" height="96" rx="10" fill="#ffffff" stroke="#E3E8E5" strokeWidth="2" />
        <rect x="196" y="116" width="36" height="62" rx="4" fill="#1B7A4B" />
        <rect x="204" y="126" width="20" height="4" rx="2" fill="#ffffff" opacity="0.85" />
        <rect x="204" y="134" width="14" height="4" rx="2" fill="#F5D67E" />
        <circle cx="214" cy="188" r="3" fill="#E3E8E5" />
      </g>

      {/* Head */}
      <ellipse cx="150" cy="140" rx="54" ry="58" fill="#EFB98A" />

      {/* Hair */}
      <path
        d="M96 128 C92 84 122 56 150 56 C182 56 208 82 205 126 C199 110 186 118 182 100 C160 116 122 114 104 96 C100 108 100 118 96 128 Z"
        fill="#123A26"
      />

      {/* Ear */}
      <ellipse cx="198" cy="146" rx="7" ry="10" fill="#EFB98A" />

      {/* Face */}
      <circle cx="130" cy="140" r="5.5" fill="#1E1E1E" />
      <circle cx="168" cy="140" r="5.5" fill="#1E1E1E" />
      <path d="M124 165 C136 178 162 178 174 165" stroke="#1E1E1E" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="112" cy="156" r="7" fill="#E38F63" opacity="0.35" />
      <circle cx="186" cy="156" r="7" fill="#E38F63" opacity="0.35" />
    </svg>
  );
}
