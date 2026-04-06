import { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { Play } from 'lucide-react';
import { useToast } from '@/contexts/toast-context';

interface Props {
  repoName: string;
  onSuccess: (deploymentId: string) => void;
}

export function DeployButton({ repoName, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDeploy = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ deploymentId: string }>(`/api/repos/${repoName}/deploy`, {
        method: 'POST',
      });
      onSuccess(res.deploymentId);
      toast('Deployment started successfully', 'success');
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast(e.message || 'Deploy failed', 'error');
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
    </div>
  );
}
