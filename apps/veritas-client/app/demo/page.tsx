import { redirect } from 'next/navigation';

export default function DemoRedirect() {
  redirect('/demos/all');
}
