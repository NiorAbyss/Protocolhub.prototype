import { usePosts } from "@/hooks/use-posts";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { data: posts, isLoading, error } = usePosts();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <p className="text-destructive font-medium">Failed to load posts</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-12">
        <section className="space-y-4 text-center py-10 md:py-16 lg:py-24">
          <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
            Thoughts & Ideas
          </h1>
          <p className="mx-auto max-w-[700px] text-muted-foreground text-lg md:text-xl">
            A minimalist space for sharing insights, tutorials, and stories about modern web development.
          </p>
        </section>

        {posts && posts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-muted rounded-xl bg-muted/20">
            <h3 className="text-xl font-bold mb-2">No posts yet</h3>
            <p className="text-muted-foreground mb-6">Be the first to share your thoughts.</p>
            <Link href="/create">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Post
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
