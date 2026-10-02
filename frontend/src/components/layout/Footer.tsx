export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-600">
        © {new Date().getFullYear()} PAT Footwear Collection (PFC). All rights
        reserved.
      </div>
    </footer>
  );
}
