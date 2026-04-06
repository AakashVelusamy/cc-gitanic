import { useRouter } from 'next/router';
import { Navbar } from '@/components/navbar';
import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function TreePage() {
  const router = useRouter();
  const { name } = router.query;
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto mt-12 p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">File Browser</h2>
        <p className="text-muted-foreground mb-4">File browser for {name}</p>
        <Link href={routes.repo(name as string)} className="btn-secondary inline-block">Back to Repository</Link>
      </div>
    </div>
  );
}
