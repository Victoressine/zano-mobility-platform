import {Suspense} from "react";

import SearchPageClient from "@/components/search/SearchPageClient";

/* ========================================
   Search Page
======================================== */

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageLoading />}>
      <SearchPageClient />
    </Suspense>
  );
}

/* ========================================
   Search Loading State
======================================== */

function SearchPageLoading() {
  return (
    <main className="min-h-screen bg-[#f8f7ff]">
      <div className="flex min-h-[70vh] items-center justify-center px-5">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#002451]/15 border-t-[#ff7417]" />

          <p className="mt-4 text-sm font-medium text-[#747680]">
            Finding available trips...
          </p>
        </div>
      </div>
    </main>
  );
}
