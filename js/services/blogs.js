/**
 * YRSF — Blogs Service
 * All Supabase queries for blog posts.
 */

import { supabase } from '../config/supabase.js';

// ─── Public Queries ───────────────────────────────────────

/**
 * Fetch all published blog posts.
 */
export async function getPublishedBlogs() {
  const { data, error } = await supabase
    .from('blogs')
    .select('id, title, slug, excerpt, image_url, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching published blogs:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch a single blog post by slug.
 */
export async function getBlogBySlug(slug) {
  const { data, error } = await supabase
    .from('blogs')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) {
    console.error('Error fetching blog post:', error);
    return null;
  }
  return data;
}

// ─── Admin Queries ────────────────────────────────────────

/**
 * Fetch ALL blog posts (for admin dashboard).
 */
export async function getAllBlogs() {
  const { data, error } = await supabase
    .from('blogs')
    .select('id, title, slug, status, image_url, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all blogs:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch full blog data by ID.
 */
export async function getBlogById(id) {
  const { data, error } = await supabase
    .from('blogs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching blog by ID:', error);
    return null;
  }
  return data;
}

/**
 * Create a new blog post.
 */
export async function createBlog(blogData) {
  const { data, error } = await supabase
    .from('blogs')
    .insert(blogData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing blog post.
 */
export async function updateBlog(id, blogData) {
  const { data, error } = await supabase
    .from('blogs')
    .update(blogData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a blog post.
 */
export async function deleteBlog(id) {
  const { error } = await supabase
    .from('blogs')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
