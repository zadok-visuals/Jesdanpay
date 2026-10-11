"use client";

// Full-size image viewer for a clicked chat attachment thumbnail — deliberately not built on top
// of Modal.tsx (that component always renders a title bar and a constrained card width, neither
// of which fits a photo viewer).
export function ChatImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL isn't a
          static asset next/image can optimize/cache, same reasoning as every other signed-URL
          image render in this app */}
      <img
        src={src}
        alt="Attachment"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
