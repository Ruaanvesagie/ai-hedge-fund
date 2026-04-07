import { Layout } from './components/layout';
import { ApiKeyGate } from './components/security/api-key-gate';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <>
      <ApiKeyGate />
      <Layout />
      <Toaster />
    </>
  );
}
