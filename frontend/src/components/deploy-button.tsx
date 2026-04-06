import { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { Play } from 'lucide-react';

interface Props {
  repoName: string;
  onSuccess: (deploymentId: string) => void;
}

export function DeployButton({ repoName, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDeploy = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ deploymentId: string }>(`/api/repos/${repoName}/deploy`, {
        method: 'POST',
      });
      onSuccess(res.deploymentId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Deploy failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        className="btn btn-primary inline-flex items-center justify-center gap-2 h-10"
        onClick={handleDeploy}
        disabled={loading}
      >
        <Play size={14} /> {loading ? 'Deploying...' : 'Deploy'}
      </button>
      {error && <p className="text-small text-danger mt-2">{error}</p>}
    </div>
  );
}
