"use client";

import { useEffect, useState, type ReactNode } from "react";

interface TutorialStep {
  title: string;
  text: ReactNode;
}

const steps: TutorialStep[] = [
  {
    title: "Toca Compartir",
    text: (
      <>
        Abre esta página en <strong>Safari</strong> y toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba) en la barra
        de abajo.
      </>
    ),
  },
  {
    title: "Agregar a pantalla de inicio",
    text: (
      <>
        Desliza el menú y elige <strong>Agregar a pantalla de inicio</strong>; después toca <strong>Agregar</strong>.
      </>
    ),
  },
  {
    title: "Abre la app desde el ícono",
    text: <>Cierra Safari, abre la app desde el ícono nuevo y activa aquí las notificaciones.</>,
  },
];

const stepDurationMs = 3200;

/** Marco del teléfono; cada paso dibuja su escena dentro de la pantalla. */
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 220" aria-hidden="true" className="mx-auto h-48 w-auto">
      <rect x="4" y="4" width="152" height="212" rx="20" className="fill-white stroke-brand-navy" strokeWidth="3" />
      <clipPath id="tutorial-screen">
        <rect x="8" y="8" width="144" height="204" rx="17" />
      </clipPath>
      <g clipPath="url(#tutorial-screen)">{children}</g>
    </svg>
  );
}

function ShareIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="stroke-brand-navy" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-6 -2v9h12v-9" />
      <path d="M0 4v-13M-4 -5l4-4 4 4" />
    </g>
  );
}

/** Paso 1: barra de Safari con el botón Compartir resaltado. */
function ShareScene() {
  return (
    <PhoneFrame>
      <rect x="20" y="30" width="120" height="10" rx="3" className="fill-neutral-light/60" />
      <rect x="20" y="48" width="90" height="6" rx="3" className="fill-neutral-light/40" />
      <rect x="20" y="60" width="104" height="6" rx="3" className="fill-neutral-light/40" />
      <rect x="20" y="72" width="70" height="6" rx="3" className="fill-neutral-light/40" />
      <rect x="8" y="182" width="144" height="30" className="fill-neutral-light/30" />
      <circle cx="80" cy="197" r="12" className="tutorial-pulse fill-brand-cyan" />
      <ShareIcon x={80} y={197} />
    </PhoneFrame>
  );
}

/** Paso 2: hoja de compartir con "Agregar a pantalla de inicio" resaltado. */
function AddScene() {
  return (
    <PhoneFrame>
      <rect x="8" y="8" width="144" height="204" className="fill-neutral-dark/20" />
      <g className="tutorial-sheet-up">
        <rect x="8" y="80" width="144" height="140" rx="14" className="fill-white" />
        <rect x="18" y="92" width="124" height="22" rx="6" className="fill-neutral-light/40" />
        <rect x="18" y="120" width="124" height="26" rx="6" className="fill-brand-cyan/30 stroke-brand-cyan" strokeWidth="2" />
        <rect x="24" y="127" width="12" height="12" rx="3" className="fill-none stroke-brand-navy" strokeWidth="2" />
        <path d="M30 129.5v7M26.5 133h7" className="stroke-brand-navy" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="44" y="130" width="78" height="6" rx="3" className="fill-brand-navy" />
        <rect x="18" y="152" width="124" height="22" rx="6" className="fill-neutral-light/40" />
        <circle cx="132" cy="133" r="9" className="tutorial-pulse fill-brand-cyan" />
      </g>
    </PhoneFrame>
  );
}

/** Paso 3: pantalla de inicio con el ícono nuevo apareciendo. */
function HomeScene() {
  const cells = Array.from({ length: 12 }, (_, index) => index);
  return (
    <PhoneFrame>
      <rect x="8" y="8" width="144" height="204" className="fill-brand-navy-alt/10" />
      {cells.map((index) => {
        const x = 22 + (index % 3) * 42;
        const y = 36 + Math.floor(index / 3) * 40;
        if (index !== 4) return <rect key={index} x={x} y={y} width="28" height="28" rx="7" className="fill-neutral-light/50" />;
        return (
          <g key={index} className="tutorial-pop">
            <rect x={x} y={y} width="28" height="28" rx="7" className="fill-brand-navy" />
            <path d={`M${x + 8} ${y + 17}a6 6 0 0 1 12 0c0 6 2 7 2 7h-16s2-1 2-7z`} className="fill-none stroke-brand-cyan" strokeWidth="2" strokeLinejoin="round" />
          </g>
        );
      })}
    </PhoneFrame>
  );
}

const scenes = [ShareScene, AddScene, HomeScene];

/**
 * Tutorial animado para agregar la app a la pantalla de inicio del iPhone (requisito de iOS para recibir push).
 * Pasa solo de paso en paso; si la persona prefiere menos movimiento, queda quieto y se avanza con los puntos.
 */
export function InstallTutorial() {
  const [stepIndex, set_step_index] = useState(0);
  const [isPaused, set_is_paused] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) set_is_paused(true);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => set_step_index((current) => (current + 1) % steps.length), stepDurationMs);
    return () => clearInterval(timer);
  }, [isPaused]);

  const Scene = scenes[stepIndex] ?? ShareScene;
  const step = steps[stepIndex] ?? steps[0];

  return (
    <div className="space-y-3">
      <p>En iPhone los avisos solo llegan si la app está en tu pantalla de inicio.</p>
      {/* La key reinicia la animación de la escena en cada paso. */}
      <div key={stepIndex} aria-hidden="true">
        <Scene />
      </div>
      <div aria-live="polite">
        <p className="font-bold text-brand-navy">
          Paso {stepIndex + 1} de {steps.length}: {step?.title}
        </p>
        <p className="mt-1">{step?.text}</p>
      </div>
      <div className="flex items-center justify-center gap-2" role="group" aria-label="Pasos del tutorial">
        {steps.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => {
              set_step_index(index);
              set_is_paused(true);
            }}
            aria-label={`Ir al paso ${index + 1}: ${item.title}`}
            aria-current={index === stepIndex ? "step" : undefined}
            className="flex h-8 w-8 items-center justify-center rounded-full"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${index === stepIndex ? "bg-brand-navy" : "bg-neutral-light"}`} />
          </button>
        ))}
      </div>
      <p className="text-center text-xs">Requiere iOS 16.4 o posterior.</p>
    </div>
  );
}
