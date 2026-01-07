import { Link } from "wouter";
import { format } from "date-fns";
import { type Post } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Calendar } from "lucide-react";
import { motion } from "framer-motion";

interface PostCardProps {
  post: Post;
  index: number;
}

export function PostCard({ post, index }: PostCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Link href={`/posts/${post.slug}`} className="block h-full group">
        <Card className="h-full border border-border/40 bg-card hover:bg-accent/40 hover:border-border transition-all duration-300 shadow-sm hover:shadow-md">
          <CardHeader className="space-y-3">
            <div className="flex items-center text-xs text-muted-foreground font-mono">
              <Calendar className="mr-1 h-3 w-3" />
              {post.createdAt && format(new Date(post.createdAt), "MMMM d, yyyy")}
            </div>
            <CardTitle className="text-xl md:text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">
              {post.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground line-clamp-3 text-sm md:text-base leading-relaxed">
              {post.excerpt}
            </p>
          </CardContent>
          <CardFooter className="pt-2">
            <div className="flex items-center text-sm font-medium text-primary group-hover:translate-x-1 transition-transform">
              Read more <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </div>
          </CardFooter>
        </Card>
      </Link>
    </motion.div>
  );
}
