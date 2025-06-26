'use client';

import { authClient } from "~/client/auth";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-4xl space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Welcome {session?.user.name}</h1>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Sign out
          </button>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Your Profile</h2>
          <div className="space-y-2">
            <p><span className="font-medium">Name:</span> {session?.user.name}</p>
            <p><span className="font-medium">Email:</span> {session?.user.email}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
