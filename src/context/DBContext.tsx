import React, { createContext, useContext, useState, useEffect } from 'react';
import type { IDatabase } from '@/db/types';
import { openAppDb } from '@/db/client';
import { CohortRepository } from '@/db/repositories/CohortRepository';
import { ContentItemRepository } from '@/db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '@/db/repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '@/db/repositories/ReviewEventRepository';
import { DrillResultRepository } from '@/db/repositories/DrillResultRepository';

export interface DBContextValue {
  db: IDatabase;
  cohortRepo: CohortRepository;
  contentItemRepo: ContentItemRepository;
  memStateRepo: ItemMemoryStateRepository;
  reviewEventRepo: ReviewEventRepository;
  drillRepo: DrillResultRepository;
}

const DBContext = createContext<DBContextValue | null>(null);

export function DBProvider({ children }: React.PropsWithChildren) {
  const [value, setValue] = useState<DBContextValue | null>(null);

  useEffect(() => {
    openAppDb().then((db) => {
      setValue({
        db,
        cohortRepo: new CohortRepository(db),
        contentItemRepo: new ContentItemRepository(db),
        memStateRepo: new ItemMemoryStateRepository(db),
        reviewEventRepo: new ReviewEventRepository(db),
        drillRepo: new DrillResultRepository(db),
      });
    });
  }, []);

  return <DBContext.Provider value={value}>{children}</DBContext.Provider>;
}

export function useDBContext(): DBContextValue | null {
  return useContext(DBContext);
}
