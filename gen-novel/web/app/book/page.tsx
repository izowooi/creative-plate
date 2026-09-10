import { Suspense } from 'react';
import { RemoteLibrary, Loading } from '@/components/remote-library';
export default function Page() {return <Suspense fallback={<Loading/>}><RemoteLibrary mode="book"/></Suspense>;}
