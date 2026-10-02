"use client";

import { useEffect, useState } from "react";

export default function Home() {
  // Holds the text shown for the API status
  const [health, setHealth] = useState("checking...");

  // On load, call the backend health route through the /api rewrite
  useEffect(() => {
    fetch("/api/v1/health")
      .then((r) => r.json())
      .then((d) => setHealth(JSON.stringify(d)))
      .catch(() => setHealth("API unreachable"));
  }, []);

  // Simple page proving frontend → backend → database works
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">PAT Footwear Collection</h1>
      <p className="mt-2 text-sm text-gray-600">API status: {health}</p>
    </main>
  );
}