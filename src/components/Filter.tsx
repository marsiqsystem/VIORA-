"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";

const FilterContent = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");

  // Debounce search
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  const handleSearch = useCallback(
    debounce((value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      replace(`${pathname}?${params.toString()}`);
    }, 300),
    [pathname, searchParams, replace]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    handleSearch(value);
  };

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    replace(`${pathname}?${params.toString()}`);
  };

  const handleCategoryClick = (category: string) => {
    const params = new URLSearchParams(searchParams);
    const currentCat = params.get("cat");
    if (currentCat === category) {
      params.delete("cat");
    } else {
      params.set("cat", category);
    }
    replace(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    replace(pathname);
  };

  const hasFilters = searchParams.toString().length > 0;
  const activeFiltersCount = Array.from(searchParams.keys()).length;

  const categories = [
    { slug: "all-products", label: "All" },
    { slug: "frocks", label: "Frocks" },
    { slug: "soft-toys", label: "Soft Toys" },
    { slug: "watches", label: "Watches" },
    { slug: "fragrances", label: "Fragrances" },
  ];

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <div className="search-bar">
          <svg
            className="search-icon"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                const params = new URLSearchParams(searchParams);
                params.delete("q");
                replace(`${pathname}?${params.toString()}`);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-gray-600"
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => handleCategoryClick(cat.slug)}
            className={`filter-chip whitespace-nowrap ${searchParams.get("cat") === cat.slug || (!searchParams.get("cat") && cat.slug === "all-products")
              ? "active"
              : ""
              }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Mobile Filter Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden w-full py-3 px-4 bg-white rounded-lg flex items-center justify-between shadow-sm border border-gray-100"
      >
        <span className="font-medium flex items-center gap-2 text-primary">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters & Sort
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </span>
        <svg
          className={`w-5 h-5 transition-transform text-gray-400 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Filters Container */}
      <div
        className={`${isOpen ? "block" : "hidden"
          } md:flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 md:p-5 rounded-xl shadow-sm md:shadow-premium border border-gray-100`}
      >
        {/* Left - Filter Options */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 flex-wrap">
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</label>
            <select
              name="type"
              className="py-2.5 px-4 rounded-lg text-sm font-medium bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer hover:border-silver transition-colors"
              onChange={handleFilterChange}
              value={searchParams.get("type") || ""}
            >
              <option value="">All Types</option>
              <option value="physical">Physical</option>
              <option value="digital">Digital</option>
            </select>
          </div>

          {/* Price Range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Price Range</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name="min"
                placeholder="Min ₹"
                className="w-24 py-2.5 px-3 rounded-lg text-sm bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                onChange={handleFilterChange}
                defaultValue={searchParams.get("min") || ""}
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                name="max"
                placeholder="Max ₹"
                className="w-24 py-2.5 px-3 rounded-lg text-sm bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                onChange={handleFilterChange}
                defaultValue={searchParams.get("max") || ""}
              />
            </div>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="text-sm text-primary font-medium hover:underline flex items-center gap-1.5 py-2.5"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Right - Sort */}
        <div className="mt-4 md:mt-0 flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sort By</label>
          <select
            name="sort"
            className="py-2.5 px-4 rounded-lg text-sm font-medium bg-white border border-gray-200 focus:ring-2 focus:ring-primary cursor-pointer hover:border-silver transition-colors min-w-[180px]"
            onChange={handleFilterChange}
            value={searchParams.get("sort") || ""}
          >
            <option value="">Featured</option>
            <option value="asc price">Price: Low to High</option>
            <option value="desc price">Price: High to Low</option>
            <option value="asc lastUpdated">Newest First</option>
            <option value="desc lastUpdated">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Active Filters Summary */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Active filters:</span>
          {searchParams.get("q") && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-silver-light rounded-full text-sm">
              Search: &quot;{searchParams.get("q")}&quot;
              <button
                onClick={() => {
                  setSearchQuery("");
                  const params = new URLSearchParams(searchParams);
                  params.delete("q");
                  replace(`${pathname}?${params.toString()}`);
                }}
                className="ml-1 hover:text-primary"
              >
                ×
              </button>
            </span>
          )}
          {searchParams.get("cat") && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-silver-light rounded-full text-sm">
              Category: {searchParams.get("cat")?.replace(/-/g, " ")}
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("cat");
                  replace(`${pathname}?${params.toString()}`);
                }}
                className="ml-1 hover:text-primary"
              >
                ×
              </button>
            </span>
          )}
          {searchParams.get("min") && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-silver-light rounded-full text-sm">
              Min: ₹{searchParams.get("min")}
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("min");
                  replace(`${pathname}?${params.toString()}`);
                }}
                className="ml-1 hover:text-primary"
              >
                ×
              </button>
            </span>
          )}
          {searchParams.get("max") && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-silver-light rounded-full text-sm">
              Max: ₹{searchParams.get("max")}
              <button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("max");
                  replace(`${pathname}?${params.toString()}`);
                }}
                className="ml-1 hover:text-primary"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const Filter = () => {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-12 bg-gray-100 rounded-lg animate-pulse"></div>
          <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
        </div>
      }
    >
      <FilterContent />
    </Suspense>
  );
};

export default Filter;
