import { NextResponse } from 'next/server';
import { getPostBySlug } from '../../../lib/blog';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json(post);
}