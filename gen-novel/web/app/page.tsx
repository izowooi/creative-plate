import { Suspense } from 'react';
import { RemoteLibrary, Loading } from '@/components/remote-library';

export default function Home() {
  return <Suspense fallback={<Loading/>}><RemoteLibrary/></Suspense>;
}
