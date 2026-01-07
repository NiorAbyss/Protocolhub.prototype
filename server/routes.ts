import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

async function seed() {
  const existing = await storage.getPosts();
  if (existing.length === 0) {
    await storage.createPost({
      title: "Welcome to the Starter Template",
      slug: "welcome-starter",
      excerpt: "This is a fullstack starter template with React, Vite, and Express.",
      content: "This template provides a solid foundation for building fullstack applications. It includes a database, API routes, and a modern frontend setup.",
    });
    await storage.createPost({
      title: "Building Modern Apps",
      slug: "building-modern-apps",
      excerpt: "Learn how to build scalable applications with modern tools.",
      content: "We use Drizzle ORM for type-safe database interactions, Zod for validation, and TanStack Query for efficient data fetching.",
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed data on startup
  seed();

  app.get(api.posts.list.path, async (req, res) => {
    const posts = await storage.getPosts();
    res.json(posts);
  });

  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json(post);
  });

  app.post(api.posts.create.path, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      const post = await storage.createPost(input);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  return httpServer;
}
