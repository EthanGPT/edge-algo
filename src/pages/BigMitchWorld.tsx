import { lazy, Suspense, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gamepad2 } from "lucide-react";

// Lazy load the 3D world to prevent blocking
const BigMitchOffice = lazy(() => import("@/components/ml/BigMitchOffice"));

export default function BigMitchWorldPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Back button overlay */}
      <Link
        to="/bot-analytics"
        className="fixed top-4 left-4 z-[100] flex items-center gap-2 px-4 py-2 bg-black/80 hover:bg-black border border-accent/30 text-accent text-sm font-mono transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Exit World
      </Link>

      {/* Controls hint */}
      <div className="fixed bottom-4 left-4 z-[100] flex items-center gap-3 px-4 py-2 bg-black/80 border border-white/10 text-white/60 text-xs font-mono">
        <Gamepad2 className="w-4 h-4 text-accent" />
        <span>WASD to move • Mouse to look • Click doors to enter • ESC to exit rooms</span>
      </div>

      {/* 3D World */}
      {ready ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white">
              <div className="relative">
                <div className="w-16 h-16 border-2 border-accent/30 border-t-accent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-accent text-2xl font-bold">M</span>
                </div>
              </div>
              <p className="mt-6 text-lg font-mono text-accent">Loading Big Mitch's World...</p>
              <p className="mt-2 text-sm text-white/50 font-mono">Preparing the office environment</p>
            </div>
          }
        >
          <BigMitchOffice />
        </Suspense>
      ) : (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-accent/30 border-t-accent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-accent text-2xl font-bold">M</span>
            </div>
          </div>
          <p className="mt-6 text-lg font-mono text-accent">Initializing...</p>
        </div>
      )}
    </>
  );
}
