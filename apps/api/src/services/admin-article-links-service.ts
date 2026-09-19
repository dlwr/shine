import {eq} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {BaseService} from './base-service';

export class AdminArticleLinksService extends BaseService {
  async flagArticleAsSpam(articleId: string): Promise<string | undefined> {
    const updated = await this.database
      .update(articleLinks)
      .set({isSpam: true})
      .where(eq(articleLinks.uid, articleId))
      .returning({movieUid: articleLinks.movieUid});
    return updated[0]?.movieUid;
  }

  async setArticleLinkOwner(
    articleId: string,
    isOwnerSubmission: boolean,
  ): Promise<string | undefined> {
    const updated = await this.database
      .update(articleLinks)
      .set({isOwnerSubmission})
      .where(eq(articleLinks.uid, articleId))
      .returning({movieUid: articleLinks.movieUid});
    return updated[0]?.movieUid;
  }

  async deleteArticleLink(articleId: string): Promise<string | undefined> {
    const deleted = await this.database
      .delete(articleLinks)
      .where(eq(articleLinks.uid, articleId))
      .returning({movieUid: articleLinks.movieUid});
    return deleted[0]?.movieUid;
  }
}
