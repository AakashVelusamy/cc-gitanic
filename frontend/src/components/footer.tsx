// persistent footer component
// displays application branding and versioninginfo
// provides responsive layout for legal and credits
// implements consistent glassmorphic styling
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="glass w-full m-0 mt-auto rounded-none rounded-t-2xl border-x-0 border-b-0 backdrop-blur-xl glow-border pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center py-2 text-[10px] sm:text-xs text-muted-foreground gap-1 sm:gap-0">
          <div className="flex items-center text-center gap-2">
            <Link href="/" className="font-mono hover:text-foreground transition-colors font-semibold">
              gitanic
            </Link>
            <span className="text-muted-foreground/50">•</span>
            <span className="font-mono font-semibold">
              commit. ship. repeat.
            </span>
          </div>

          <div className="flex items-center text-center">
            <span className="font-mono">built by: aakash velusamy - jovisha curlie k</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
