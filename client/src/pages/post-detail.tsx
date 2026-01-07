import { usePost } from "@/hooks/use-posts";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Share2 } from "lucide-react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";

export default function PostDetail() {
  const [, params] = useRoute("/posts/:slug");
  const slug = params?.slug || "";
  const { data: post, isLoading, error } = usePost(slug);

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto space-y-8 animate-pulse">
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !post) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <h2 className="text-2xl font-bold">Post not found</h2>
          <Link href="/">
            <Button variant="default">Return Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8 flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm" className="pl-0 hover:pl-2 transition-all">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to posts
              </Button>
            </Link>
            <Button variant="ghost" size="icon">
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <header className="mb-12 space-y-4 border-b pb-8">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground font-mono">
              <Calendar className="h-4 w-4" />
              <time>{post.createdAt && format(new Date(post.createdAt), "MMMM d, yyyy")}</time>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl lg:leading-[1.1]">
              {post.title}
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              {post.excerpt}
            </p>
          </header>

          <div className="prose prose-stone dark:prose-invert max-w-none prose-lg">
            {/* 
              In a real app, you would use a markdown renderer here.
              For simplicity, we'll just render text with newlines. 
            */}
            {post.content.split("\n").map((paragraph, i) => (
              <p key={i} className="mb-4 text-lg leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>
      </article>
    </Layout>
  );
}
