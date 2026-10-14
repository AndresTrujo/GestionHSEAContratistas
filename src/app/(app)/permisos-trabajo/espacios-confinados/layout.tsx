import type { ReactNode } from "react";

/** Marco del formato FO-0234: banda naranja y hoja blanca al centro. */
export default function ConfinedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-orange-500 p-4 sm:p-6">
      <div className="bg-white p-6 sm:p-8">{children}</div>
    </div>
  );
}
