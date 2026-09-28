"use client";

import { useEffect } from "react";
import { trackGa4Event } from "@/lib/ga4";

type Item = { id: string; name: string; price: number };

/** GA4 view_item_list (and view_search_results for searches) once per distinct list. */
const ListViewTracker = ({ listId, listName, query, items }: { listId: string; listName: string; query?: string; items: Item[] }) => {
  const signature = `${listId}|${query || ""}|${items.map((i) => i.id).join(",")}`;

  useEffect(() => {
    // gtag loads after hydration; give it a moment before giving up silently.
    const timer = window.setTimeout(() => {
      if (query) trackGa4Event("view_search_results", { search_term: query });
      trackGa4Event("view_item_list", {
        item_list_id: listId,
        item_list_name: listName,
        items: items.slice(0, 30).map((item, index) => ({
          item_id: item.id,
          item_name: item.name,
          price: item.price,
          index,
          item_list_id: listId,
          item_list_name: listName,
        })),
      });
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
};

export default ListViewTracker;
