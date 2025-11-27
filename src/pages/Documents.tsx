import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Upload, Trash2, Loader2, Eye, Share2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Document = {
  id: string;
  name: string;
  created_at: string;
  file_path: string;
  owner_id: string;
  shared_with_id?: string;
  profiles?: { full_name: string } | null; // For shared user name
};

type Member = {
  user_id: string;
  profiles: {
    full_name: string;
  };
};

const Documents = () => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [selectedShare, setSelectedShare] = useState<string>("private");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const { toast } = useToast();
  
  const workspaceId = localStorage.getItem("activeWorkspaceId");

  // 1. Get Current User
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // 2. Fetch Members (FIXED: Use explicit Foreign Key syntax)
  useEffect(() => {
    const fetchMembers = async () => {
      if (!workspaceId) return;
      
      const { data, error } = await supabase
        .from("workspace_members")
        .select(`
          user_id,
          profiles!workspace_members_user_id_fkey(full_name)
        `)
        .eq("workspace_id", workspaceId);
      
      if (error) {
        console.error("Error fetching members:", error);
      } else if (data) {
        // Map to ensure correct structure
        const formatted = data.map((m: any) => ({
          user_id: m.user_id,
          profiles: m.profiles || { full_name: "Unknown" }
        }));
        setMembers(formatted);
      }
    };
    fetchMembers();
  }, [workspaceId]);

  // 3. Fetch Docs
  const fetchDocs = async () => {
    if (!workspaceId) return;
    
    const { data, error } = await supabase
      .from("documents")
      .select(`
        *,
        profiles:shared_with_id(full_name)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching documents:", error);
    } else {
      setDocs(data as any || []);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [workspaceId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!workspaceId) {
      toast({
        title: "No Workspace Selected",
        description: "Please select a team/workspace from the sidebar.",
        variant: "destructive",
      });
      return;
    }

    if (!uploadingFile) return;

    setIsUploading(true);
    try {
      const fileExt = uploadingFile.name.split('.').pop();
      const filePath = `${workspaceId}/${crypto.randomUUID()}.${fileExt}`;

      // Determine Sharing
      const sharedWithId = selectedShare === "private" ? null : selectedShare;

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('workspace_docs')
        .upload(filePath, uploadingFile);

      if (uploadError) throw uploadError;

      // 2. Save metadata (With Permissions)
      const { data: savedDoc, error: dbError } = await supabase.from("documents").insert({
        name: uploadingFile.name,
        workspace_id: workspaceId,
        file_path: filePath,
        owner_id: currentUserId,
        shared_with_id: sharedWithId
      }).select().single();

      if (dbError) throw dbError;

      // 3. Trigger AI Processing
      toast({ title: "Processing", description: "Generating AI embeddings..." });
      
      const { error: processError } = await supabase.functions.invoke("process-doc", {
        body: { 
          document_id: savedDoc.id, 
          file_path: filePath 
        }
      });

      if (processError) {
        console.error("Processing error:", processError);
        toast({ title: "Warning", description: "File saved, but AI processing failed.", variant: "destructive" });
      } else {
        toast({ title: "Success", description: "File processed and secured!" });
      }

      setUploadingFile(null);
      setSelectedShare("private");
      
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchDocs();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to upload file.", 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDoc = async (id: string, path: string) => {
    const { error: dbError } = await supabase.from("documents").delete().eq("id", id);
    if (dbError) {
      toast({ title: "Error", description: "You can only delete your own files.", variant: "destructive" });
      return;
    }

    await supabase.storage.from('workspace_docs').remove([path]);
    toast({ title: "Deleted", description: "Document removed." });
    fetchDocs();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Documents
        </h1>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Upload Private Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-4">
            <Input 
              id="file-upload"
              type="file" 
              onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
              className="flex-1"
              accept=".pdf,.txt,.md,.doc,.docx"
            />
            
            {/* Share Dropdown */}
            <Select value={selectedShare} onValueChange={setSelectedShare} disabled={isUploading}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Share with..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Lock className="w-4 h-4" /> Private (Me Only)
                  </div>
                </SelectItem>
                
                {/* FIX: Better handling for empty list */}
                {members.filter(m => m.user_id !== currentUserId).length > 0 ? (
                  members
                    .filter(m => m.user_id !== currentUserId)
                    .map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      Share with {m.profiles?.full_name || "User"}
                    </SelectItem>
                  ))
                ) : (
                   <SelectItem value="none" disabled>
                     No other members in workspace
                   </SelectItem>
                )}
              </SelectContent>
            </Select>

            <Button type="submit" disabled={isUploading || !uploadingFile}>
              {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Document List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((doc) => (
          <Card key={doc.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="truncate">
                  <p className="font-medium truncate" title={doc.name}>{doc.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    
                    {/* Access Indicator */}
                    {doc.owner_id === currentUserId && !doc.shared_with_id && (
                      <span className="flex items-center gap-1 text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}
                    {doc.shared_with_id && (
                      <span className="flex items-center gap-1 text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                        <Share2 className="w-3 h-3" /> {doc.profiles?.full_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc.id, doc.file_path)}>
                  <Trash2 className="w-4 h-4 text-destructive opacity-70 hover:opacity-100" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {docs.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-10 border-2 border-dashed rounded-xl">
            No documents visible. (Note: You only see docs you own or are shared with you).
          </div>
        )}
      </div>
    </div>
  );
};

export default Documents;