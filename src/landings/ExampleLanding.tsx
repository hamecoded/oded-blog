import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { useGroupPosts, useSite } from '../lib/site';
import { pickText, postPath } from '../lib/util';
import { usePageTitle } from '../pages/usePageTitle';
import { VideoEmbed } from '../site/blocks';
import type { LandingProps } from './index';

/**
 * A deliberately small custom landing, as a starting point to copy: the group's name, tagline, video and a
 * plain list of its posts. Registered as "example" in ./index.ts.
 */
export default function ExampleLanding({ group }: LandingProps) {
  const { prefs } = useApp();
  const { link, siteName } = useSite();
  const posts = useGroupPosts(group, 10);
  usePageTitle();
  return (
    <div className="container example-landing">
      <h1 dir="auto">{siteName}</h1>
      <p dir="auto" className="muted">
        {pickText(group.config.tagline, prefs.uiLang)}
      </p>
      <VideoEmbed url={group.config.video_url} />
      <ul>
        {posts?.map((p) => (
          <li key={p.id}>
            <Link to={link(postPath(p.slug))} dir="auto">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
