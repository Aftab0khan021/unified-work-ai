import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileText, CheckSquare, Search } from "lucide-react";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ type: 'task' | 'doc', id: string, title: string }[]>([]);
  const navigate = useNavigate();
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open && workspaceId) {
      fetchResults();
    }
  }, [open, workspaceId]);

  const fetchResults = async () => {
    // Fetch Tasks
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("workspace_id", workspaceId)
      .limit(5);

    // Fetch Docs
    const { data: docs } = await supabase
      .from("documents")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .limit(5);

    const combined = [
      ...(tasks?.map(t => ({ type: 'task' as const, id: t.id, title: t.title })) || []),
      ...(docs?.map(d => ({ type: 'doc' as const, id: d.id, title: d.name })) || [])
    ];
    setResults(combined);
  };

  const handleSelect = (item: typeof results[0]) => {
    setOpen(false);
    if (item.type === 'task') navigate('/tasks'); // Or navigate to specific detail view if you have one
    if (item.type === 'doc') navigate('/documents');
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Tasks">
          {results.filter(r => r.type === 'task').map(item => (
            <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
              <CheckSquare className="mr-2 h-4 w-4" />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Documents">
          {results.filter(r => r.type === 'doc').map(item => (
            <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
              <FileText className="mr-2 h-4 w-4" />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}