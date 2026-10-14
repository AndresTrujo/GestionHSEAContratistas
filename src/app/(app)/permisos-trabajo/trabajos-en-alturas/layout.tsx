import type { ReactNode } from "react";

/** Marco del formato FO-0060: banda amarilla con filete negro y hoja blanca al centro. */
export default function HeightsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="border-2 border-black bg-yellow-300 p-4 sm:p-6">
      <div className="bg-white p-6 sm:p-8">{children}</div>
    </div>
  );
}
