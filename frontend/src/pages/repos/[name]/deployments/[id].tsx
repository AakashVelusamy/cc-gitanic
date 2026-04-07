import { useRouter } from 'next/router';
import Link from 'next/link';
import { routes } from '@/lib/routes';

export default function DeploymentsPage() {
  const router = useRouter();
  const { name } = router.query;
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto mt-12 p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">Deployments</h2>
        <p className="text-muted-foreground mb-4">Deployment history for {name}</p>
        <Link href={routes.repo(name as string)} className="btn-secondary inline-block">Back to Repository</Link>
      </div>
    </div>
  );
}
