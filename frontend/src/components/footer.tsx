import Link from 'next/link';

export function Footer() {
  return (
    <footer className="glass w-full m-0 mt-auto rounded-none rounded-t-2xl border-x-0 border-b-0 backdrop-blur-xl glow-border">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-center sm:justify-between items-center py-2 sm:h-12 text-[10px] sm:text-xs text-muted-foreground gap-1 sm:gap-0">
          <div className="flex items-center text-center">
            <span className="font-mono">built by: aakash velusamy - jovisha curlie k</span>
          </div>

          <div className="flex items-center text-center">
            <Link href="/" className="font-mono hover:text-foreground transition-colors font-semibold">
              gitanic - commit. ship. repeat.
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
