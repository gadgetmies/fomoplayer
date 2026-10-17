# Designs A and D: notes from the planning discussion

Designs A (group-formation research) and D (fine-tuning or retraining, plus embedding arithmetic) were discussed in a Claude Code session in October 2026 but never reached a design doc or an OpenSpec change. This file collects what was said, decided, measured and left open, so the specs can be written from it.

Legend: **[USER]** is the user's own words. **[DECIDED]** was agreed. **[MEASURED]** is a computed number. **[PROPOSED]** was suggested by the assistant but never approved. **[OPEN]** is unanswered.

The legal assessment of training data and the licence-workaround discussion are kept out of this public repo.

## How to pick these up

Each item below is meant for a new session. Start it with the prompt given, from a worktree off master.

**Design A (group formation): on hold until the cart reviews are done.** The pending reviews are the zz crates
46–62, the "0 höyge" and Halftime split carts, and the 07/11/16 split carts. The reviews live in the carts themselves
(kept tracks stay, removed tracks are the negatives), so nothing else needs saving. When they are done:

> Spec design A (group-formation research) with brainstorm-to-openspec. Start from
> `docs/research/designs-a-and-d-notes.md` section 1; the design section there was presented twice but never
> approved. My reviews of all zz crates, the höyge/Halftime splits and the 07/11/16 splits are done. Recompute the
> 0.69 removal-ranking baseline on the full reviewed set first, because the scripts behind it are gone.

**Design D (fine-tuning or retraining, plus embedding arithmetic): ready to brainstorm.** The blocking question is
answered (2026-10-17): **Fomo Player is not commercial**, and the user does not expect it to become a business,
since it relies on data scraped from the stores. That makes the non-commercial Discogs-EffNet licence workable for
the service, so fine-tuning EffNet is back on the table next to permissive models and training from scratch.
Still open: which training audio may be used (see the private legal notes on `/Volumes/DJ/research/`), the
share-alike vs no-derivatives wording of the model licence (relevant if a fine-tuned model is shared), and the
label source.

> Brainstorm design D (fine-tuning or retraining for EDM, plus embedding arithmetic) with brainstorm-to-openspec.
> Start from `docs/research/designs-a-and-d-notes.md` section 2 and the findings in
> `openspec/changes/archive/2026-10-17-effnet-perception-research/FINDINGS.md`. Fomo Player is not commercial.
> Compute: local Mac. Include permissive models and training from scratch.

**Preview vs full-track check: a separate small OpenSpec change.** The perception research found that a 30 s excerpt
at a fixed position keeps only about 6.4 of the full-track mean's 10 nearest neighbours, against 8.1 for the most
typical 30 s. Production embeds store previews, cut at a position the store chooses. The check: for AKIN tracks that
also exist in fomoplayer, embed the Beatport preview with the analyser model and compare it with the full-track mean
and the typical 30 s, using the same top-10 overlap on the same reference set. It reuses `epr`
(`analyser/research/effnet-perception/`), reads production read-only, and about a day of work. The result decides
whether D is about fixing the input or about changing the model.

> Propose an OpenSpec change `preview-vs-full-track-embeddings` with brainstorm-to-openspec: measure how well
> production's store-preview embeddings stand in for full-track embeddings on AKIN tracks that are also in
> fomoplayer, reusing `analyser/research/effnet-perception/` (see "Preview vs full-track check" in
> `docs/research/designs-a-and-d-notes.md`).

---

## 0. How A and D came about (shared context)

- **[USER]**, the origin of the "0 höyge" cart: "I created a new "0 höyge" cart. That cart has at least four different groups …". The user named four groups, each defined by a few artists (names omitted here), and asked for an analysis on a Lavish page.
  - Result: Ward clustering with k=6 chosen by hand; k=4 reproduced the user's 4 groups.
  - Page: `.lavish/hoyge-groups.html`. It is untracked and holds personal data.
- **Earlier prototype** (`packages/back/scripts/prototype-multi-ref-clustering/README.md`), **[MEASURED]**:
  - A track's nearest neighbour is in the same cart 56% of the time; chance is about 10%.
  - ARI for recovering two mixed carts: 0.32 with the auto cut, 0.54 with the best cut.
  - The assistant later argued that cart labels were the wrong yardstick.
- The user asked whether to use the embedding components a group agrees on.
  - **[PROPOSED]** Weight components softly rather than as hard filters: a diagonal Mahalanobis distance divided by the catalogue spread, with shrinkage or PCA-64.
  - **[PROPOSED]** Or learn a linear direction (group vs. random, with misses as hard negatives) that can be searched through pgvector's inner-product index.
  - **[PROPOSED]** An offline hide-one-track test to compare the approaches.
- The user described two problems: off-style results, and "right style, wrong direction". Assistant proposals:
  - nearest-k references or k-of-n matching;
  - a per-group cutoff;
  - segment vectors;
  - a Discogs-400 style filter, which needs the plain `discogs-effnet-bs64` embedding;
  - Rocchio push-away from misses;
  - removing the miss direction;
  - a learned classifier;
  - storing misses per user (later overruled for C).
- **[USER]**, the four-item spec request:
  - "2. implement a research task that tests different ways of forming the groups to see what works best and what input is required."
  - "4. find out and spec ways I could either train my own model using similar data or to train the Discogs Effnet model further to fit better my needs / to suit better especially EDM (techno, trance, house, breakbeat, drum and bass, etc. genres)"
- The assistant classified this as **architectural**:
  - one design doc and one OpenSpec change per item;
  - flow: brainstorm-to-openspec, ending in `i-openspec-propose`, not writing-plans;
  - design docs go to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
  - **[PROPOSED]** assumption: research changes produce a harness plus findings, and D "stops at a written plan with costs; it doesn't start training". The user never explicitly confirmed this.
- **[USER]**, the embedding-arithmetic request: "research if it would be possible to do math with single track embeddings or with group centroids … "like track a, but with the style difference of tracks b and c". Similar to "king - man + woman = queen"."
- Arithmetic was added as change 5, along with assistant reasoning:
  - B's controlled perturbation pairs give clean directions.
  - Real-world directions could come from remix/original pairs, a label then vs. now, or genre centroid differences.
  - Push-away is "arithmetic with negative weight".
  - **[PROPOSED] expectation:** EffNet was trained to classify, not to make differences add up, so arithmetic "may only partly work". Measure how well it works rather than giving a yes or no.
- **[USER]**, which set the structure: "The groups formed earlier were mostly quite good, so splitting the contents of the cart into subgroups would seem like a good idea in order to not make the search too generic. … Starting with the grouping research sounds like a good plan. I'd still do the Discogs Effnet testing parallelly … The fifth research should be combined with the fourth change to see if the fine-tuning or retraining could be done in a way to better support the calculations."
- **[DECIDED]**, the final structure:

  | Change | Content | When |
  |---|---|---|
  | A | Group-formation research | now |
  | B | EffNet perception | in parallel |
  | C | Cart similarity search | after A |
  | D | Fine-tune or retrain, plus embedding arithmetic | after B |

  - In practice C was built before A. B was finished later in the session. A and D were never specced.

---

## 1. Design A: group-formation research

### 1.1 User statements and answers

- **[USER]**, the core premise: "My expectation is that the users will likely have carts with multiple different, but related groups of music and searching tracks calculating a centroid of all the embeddings would likely yield a too vague filtering. … the current "0 höyge" cart could be split into smaller, more specific carts based on the similarity grouping. I could review the split crates to ensure those are stylistically sound."
- **[USER]:** "go through the existing carts and list the most cohesive ones in order to pick these for the evaluations."
- **[USER]:** "it's ok to store the crates as real carts in my fomoplayer account. could you go through the purchased cart and form carts based on groups of similar tracks …" The same message asked for a 2D graph.
- **[USER]:** result pages must always have a regular list besides the 2D map, publish for mobile, auto-advance playback. This became the memory note `result-pages-list-and-map.md`.
- **[USER]:** "yes, create the draft carts". **[USER]:** "rename the carts so that they appear at the end of the carts list."
- **[USER]:** "For the "what would you be willing to do to get the groups"-question: b would be the best option." Option (b) is to choose the number of groups or use a coarse ↔ fine slider.
- **[USER]:** "A) There is already a lot to review in the carts split from the Purchased cart, so only split the "+ höyge" and "Halftime" carts in addition to the Purchased." The assistant read "+ höyge" as "0 höyge"; the user never corrected this.
- **[USER]:** "What information did you use when splitting the Purchased into carts?" Answer: audio embeddings only, with metadata used only for naming (see 1.4).
- **[USER]**, the review feedback, abridged:
  - "I went through the carts in alphabetical name order until cart …" (crate 45).
  - Two slightly separate groups in crates 07, 11 and 16.
  - Crate 13: "breakbeat tracks, but the tracks differed quite much".
  - Crate 28: "similar bass and drums, but would not perhaps work that well as a filter … hit / miss".
  - Consistent crates: 32, 35, 36, 37, 39, 40, 41, 42, 43.
  - Similar across carts: {35, 36, 37} and {40, 42}. "For the similar carts, dividing them to separate carts and recommending separately is probably not an issue in use, but telling the carts apart in this audition was difficult."
  - "I removed many tracks from the carts to make the contents more consistent. I moved only a handful of tracks to other carts as it was difficult to remember what each cart contained."
- **[USER]:** "What do you mean by "tracks you no longer want"?" **[USER]:** "No, I only removed the tracks to make the contents more consistent."
  - This made all removals count as grouping errors.
- **[USER]:** "Can you create new carts from the split carts that sit next to the previous cart so I can review the contents?"
- **[USER]**, abridged:
  - "You can do a trial on the segment embeddings, but I recall that an earlier test showed that the difference using the segments and the average were not very large. I also thought earlier that picking a "median" embedding from the different segments instead of averaging all the values might work better."
  - "I would rather not combine any other information than the embeddings for the search for now. Also, the model is trained on the artist, label etc. data, so if it is audible, it should already be in the model at least to an extent."
  - Asked for the distance from the centroid to be shown in the UI.
  - Asked whether "a more complex distance calculation that would take the direction into consideration" is feasible, to exclude tracks according to what is removed or ignored.
  - Asked whether fine-tuning or a new model would give "a higher confidence" (see D).
- **[USER]:** show only the number in the table, with a tooltip. "the misses can be stored per session, but I don't yet want a persistent storage on the server side." This is mainly a C decision, but it limits where A and D can get negatives from.
- **[USER]**, in B: asked "Why is the grouping for "tracks that belong together" needed?" and answered "3", meaning B Part 1 is descriptive only, with no ground truth. This was not a decision about A, but it shows the user is wary of extra labelling work.

### 1.2 Decisions agreed for A

| # | Decision |
|---|---|
| A-1 | Grouping should be part of the cart search so results stay specific. A starts first. |
| A-2 | Ground truth comes from carts split into smaller sub-carts and reviewed by the user, not from original cart labels. |
| A-3 | Split crates are stored as real carts in the user's production account. |
| A-4 | Purchased was split into 62 draft carts (ids 205–266), first prefixed "~", renamed to "zz NN …" so they sort last. |
| A-5 | Grouping input is (b): choose the number of groups, or a coarse ↔ fine slider. The assistant mapped this to a hierarchical cluster tree, where the slider sets the cut height, groups stay nested, and moving the slider is instant. |
| A-6 | Split only "0 höyge" and Halftime in addition to Purchased. These became carts 267–276: höyge 1–5 and halftime 1–5. |
| A-7 | Removals are style mismatches (grouping errors), not taste drops. |
| A-8 | Kept tracks are crate members; removed tracks are known non-members. |
| A-9 | Crate statistics (tightness, silhouette) are inputs only, never a way to pick a method, because they didn't match the user's verdicts. |
| A-10 | **Embeddings only; artist co-occurrence is dropped.** The user said so; the assistant agreed ("I'll drop artist co-occurrence from design A") and restated it later: "only embeddings are used, with no artist co-occurrence". |
| A-11 | Split carts 277–282 were created next to their originals for review: 07a/07b, 11a/11b, 16a/16b. |

Several A design defaults were never explicitly approved; see 1.5.

### 1.3 Measured results relevant to A

**Cart cohesion**, using 23 of the user's carts, average embeddings, and 3,000 random background tracks. Nothing was written to the database.

| Cart | n | Similarity | Distinctness | Nearest match in same cart (lift) | Subgroups / separation |
|---|---|---|---|---|---|
| 0 höyge | 71 | 0.51 | **0.57** | 38% (22×) | 6 / 0.30 |
| Höyge | 70 | 0.48 | 0.51 | 33% (19×) | 2 / 0.35 |
| Stepit | 53 | 0.53 | 0.51 | 28% (16×) | 3 / 0.48 |
| Chill | 84 | 0.34 | 0.46 | 36% (21×) | 2 / 0.31 |
| Rollers | 94 | 0.56 | 0.45 | 12% (7×) | 3 / 0.32 |
| Smashers | 133 | 0.53 | 0.42 | 20% (12×) | 3 / 0.24 |
| Hassuttelu | 148 | 0.52 | 0.41 | 18% (11×) | 5 / 0.28 |
| Melodic | 148 | 0.36 | 0.32 | 19% (11×) | 3 / 0.30 |
| Halftime | 135 | 0.32 | 0.31 | 28% (16×) | 4 / 0.23 |

- **Overlaps:** Rollers and Smashers share 17 tracks, Rollers and Hassuttelu 14, Halftime and Stepit 19. The evaluation must therefore allow a track to belong to several groups.
- **Easy separations:** 0 höyge, Höyge, Stepit, Chill.
- **Hard separations:** the D&B carts Rollers, Smashers, Hassuttelu and Melodic.
- **Too small to rely on:** Foghorn, Intro, Rock and 4x4 dnb have only 8–10 analysed tracks each.

**Purchased split**:
- 3,256 analysed tracks went into 62 crates in 8 families, 2,811 tracks in total.
- 445 tracks are unsorted and 392 are not analysed. 67 analysed tracks are Bandcamp-only.
- Purchased itself still has 3,648 tracks.
- Five crates are only weakly separated: #62, #10, #45, #58, #30.
- Method:
  - centred on 3,000 random catalogue tracks;
  - Ward tree cut into 8 families;
  - a cut into 45 groups refined with spherical k-means;
  - groups over 80 tracks split, groups under 15 merged, giving 62 crates;
  - tracks closer to another crate's centroid sent to unsorted;
  - UMAP used only for map layout.
- Metadata (genre ≥20%, top artists with ≥3 tracks, middle-60% release years) was used only for names.
- Scripts (scratchpad `purchased-crates/`): `sweep.py`, `cluster.py`, `km.py`, `final.py`.

**"0 höyge" and Halftime splits**:
- 0 höyge: centred Ward clustering with the best-silhouette k (k=7) and groups of at least 5 tracks. 5 tracks were left out.
- Halftime: forced to k=5. At k=4 there was one loose group of 58 tracks (silhouette 0.07).
- Resulting carts and track counts:

  | Cart | Tracks |
  |---|---|
  | höyge 1 | 30 |
  | höyge 2 | 10 |
  | höyge 3 | 10 |
  | höyge 4 | 9 |
  | höyge 5 | 7 |
  | halftime 1 | 35 |
  | halftime 2 | 34 |
  | halftime 3 | 29 |
  | halftime 4 | 29 |
  | halftime 5 | 8 |

**Review analysis**:
- 264 of 2,036 tracks were removed from crates 1–45 (13%). 23 more were removed from crates 55–57. Only 1 move between zz carts was found.
- Removal rate by user verdict:

  | Verdict | Crates | Removed | Tightness before review |
  |---|---|---|---|
  | Consistent | 9 | 4.8% | 0.67 |
  | Two subgroups (07, 11, 16) | 3 | 33% | 0.67 |
  | No comment | 31 | 14.8% | 0.69 |

- Tightness vs. removal rate: Spearman 0.09 (p=0.57). The 2-split silhouette gave 0.22 (p=0.16) and the nearest-crate cosine 0.01. Statistics therefore don't predict the verdicts.
- **Removal AUC** (do removed tracks rank further from the crate centre; 0.5 is chance):

  | Representation | AUC | Nearest neighbour in same crate |
  |---|---|---|
  | Raw | 0.62 | 83% |
  | Centred on catalogue | 0.65 | 86% |
  | Centred on Purchased | **0.69** | 85% |
  | PCA-64 (Purchased) | 0.69 | 86% |
  | PCA-whitened 64 | 0.69 | 69% |

  This **0.69 is the "baseline to beat" named in revised design A**.
- Other cosine-based features: silhouette 0.60, mean cosine to the 5 nearest 0.63, own minus best other centroid 0.57.
- Flagging the furthest 13% gives precision and recall of about 0.29. Flagging the furthest 5% gives precision 0.35 and recall 0.13.
- **Metadata AUCs** (kept ranked higher):

  | Feature | AUC |
  |---|---|
  | Artist appears elsewhere in crate | 0.59 |
  | Release year | 0.57 |
  | Label appears elsewhere | 0.54 |
  | Same genre share | 0.53 |
  | Year distance | 0.53 |
  | BPM distance | 0.52 |
  | Remix | 0.50 |
  | Beatport preview | 0.50 |

- **Crates the user found similar are distinct in the embedding:**
  - {35, 36, 37}: centroid cosines 0.47–0.67; 94% of nearest neighbours are in their own crate.
  - {40, 42}: cosine 0.70; 100% in their own crate.
  - Crate 39 bridges 40 and 42 (0.90 and 0.91).
  - The assistant's reading: a purpose for the coarse setting of the slider.
- **Two-way splits:**
  - 07: 17 / 7. 11: 8 (around 2007) / 8 (around 2014). 16: 9 garage/bass / 28 bass house.
  - 2-split silhouette: "two groups" crates 0.28, consistent 0.23, uncommented 0.27. The check cannot flag such crates automatically yet.

**Number caveat.** The distance trials below use a different baseline (0.71) than 1.3's 0.69. The trial set includes crates 55–57 (287 removals instead of 264) and is a within-crate AUC computed by a different script. Both figures appear in the transcript.

**Direction-aware distance trials**, Purchased-centred, within-crate AUC:

| Method | AUC |
|---|---|
| Cosine to centroid (baseline) | 0.712 |
| Mean cosine to 5 nearest | 0.706 |
| Diagonal Mahalanobis (shrunk) | 0.699 |
| Full Mahalanobis, PCA-64 (Ledoit-Wolf) | 0.710 |
| Rocchio push-away, b=0.25 | 0.737 |
| Rocchio push-away, b=0.5 | 0.757 |
| Rocchio push-away, b=0.75 | **0.768** |
| Rocchio push-away, b=1.0 | 0.711 |
| Rocchio push-away, b=1.5 | 0.568 |
| Penalise the removed direction | 0.748 |
| Classifier: kept vs. removed + random | 0.702 |

**Segment embeddings**. 2,118 of 2,119 previews were embedded per segment, a median of 119 segments each.

| Pooling | AUC | AUC + push-away | Nearest neighbour in same crate |
|---|---|---|---|
| Mean (today) | 0.711 | 0.755 | 83% |
| Per-dimension median | 0.732 | 0.775 | 80% |
| Trimmed mean (drop 20%) | 0.732 | 0.775 | 82% |
| Medoid segment (the user's "median" idea) | 0.718 | 0.768 | 75% |
| Segment-to-segment matching | 0.693 | – | – |

- The median's gain is about +0.02, with a 95% interval of roughly +0.01 to +0.03.
- Push-away adds about 0.045. Median plus push-away is about +0.06 over today.
- **[PROPOSED]** Switch to the median only when re-embedding anyway, for example with a D model.
- The user's memory that segments make little difference was confirmed.
- An earlier partial run gave slightly different numbers: mean 0.735 and medoid 0.761. Treat as final.

### 1.4 Design A as presented. Approval status: **never approved.**

**First section, ** ("Design A · Group-formation research", ending "Does this section look right?"):
- **Goal:** choose the grouping method and slider behaviour for C. Measure whether searching per group beats one centroid for the whole cart.
- **Offline export approach [PROPOSED]:**
  - export all analysed embeddings once, about 110k tracks and roughly 0.5 GB, read-only;
  - run locally with numpy and scipy;
  - one final production check for the finalists;
  - the alternative, live pgvector queries, was rejected as slow and loading production.
- **Labelled data:**
  - the reviewed zz carts: 62 from Purchased, 5 from 0 höyge, 5 from Halftime;
  - the hand-separated D&B carts Rollers, Smashers, Hassuttelu and Melodic;
  - synthetic mixed test carts combining 2–5 curated carts;
  - the real 0 höyge and Halftime carts scored against their splits;
  - current contents serve as provisional labels until reviewed.
- **Representations:** raw mean; mean minus the catalogue mean; PCA-whitened 64 dimensions.
- **Methods, each with a slider:**
  - Ward or average-linkage trees, with the slider setting the cut height;
  - Leiden on a kNN graph, with the slider setting resolution;
  - k-means with k given;
  - HDBSCAN as an automatic baseline without a slider.
- **Metrics:**
  1. **Recovery:** ARI and AMI at the best slider position and with k given; whether the slider is nested and stable.
  2. **Search specificity:** hide 20% of each group and search about 110k tracks by the whole-cart centroid, per-group centroids, per-reference merged results, and groups combined with per-reference search. Score held-out tracks found in the top 50 and top 100, and contamination from other groups.
- **Outputs:**
  - report in `docs/research/grouping/`;
  - results page with a list and a 2D map;
  - recommended C defaults: method, representation, slider range, minimum group size.
- **Code:** `analyser/research/grouping/`. Exported data stays out of git.
- **No user reply** to "Does this section look right?". The next user message asked a different question.

**Revised section, ** ("Design A · revised", ending "Does this revised section look right?"):
- **Labels:** kept = member, removed = known non-member.
  - Crates 46–62 stay out until reviewed.
  - The 0 höyge and Halftime splits are scored the same way once reviewed.
  - Re-run commands pick up new reviews.
- **Metrics:**
  - **New, error ranking:** removed tracks should rank below kept ones, both when forming groups and when searching. **Baseline 0.69**; 0.5 is chance.
  - Recovery and search specificity as before, against the reviewed crates.
  - Tightness and silhouette are inputs only.
- **Representations:** Purchased-centred ("centring on your own collection") becomes the default candidate. Raw, catalogue-centred and 64-dimension stay for comparison.
- **New question, extra cues:**
  - artist co-occurrence (0.59 alone). **Later dropped** (A-10).
  - segment embeddings. Trial run; see 1.3.
- **Links:**
  - to B: removed tracks that still sit close to the crate centre become listening examples;
  - to D: kept and removed tracks give "belongs with" and "doesn't belong with" pairs for fine-tuning.
- **Separate question:** do the 07, 11 and 16 two-way splits match what the user heard? Not answered. Instead the user asked for the split carts to be created.
- **The user never said "approved"** for either version of section A.
  - The user's later messages amended it implicitly: segment trial and median test yes, embeddings only.
  - The assistant then moved on to D questions and C mockups.
  - The C design and implementation went ahead using A's interim findings: PUSH_STRENGTH 0.5, a Ward tree with auto-k and a slider, session-only misses.

### 1.5 Assistant proposals for A not explicitly approved

- The offline export of about 110k embeddings (0.5 GB) instead of live pgvector.
- The method list: Ward and average linkage, Leiden, k-means, HDBSCAN.
- The representation list. Purchased-centred as default was implied by the results but never confirmed.
- Synthetic mixed carts built from 2–5 curated carts.
- Using the D&B carts as an "already separated by hand" test.
- The held-out 20% protocol with top-50 and top-100 metrics.
- Report location `docs/research/grouping/`; code location `analyser/research/grouping/`.
- Testing whether BPM or genre added to the audio improves groupings. Effectively moot after A-10.
- The per-dimension median representation, deferred to re-embedding time.
- A "probably doesn't fit" warning was judged weak (precision about 0.29), so it was not proposed as a feature.

### 1.6 Open questions for A

- **[OPEN]** Approval of design section A. Brainstorming never got past the first design section, and no design doc or OpenSpec change exists.
- **[OPEN]** The user's review of crates **46–62** is still pending.
  - The user said: "The rest I will review later".
- **[OPEN]** Review of the **0 höyge and Halftime splits** (267–276) and of the **07, 11 and 16 split carts** (277–282). The summaries call this range "267–282".
- **[OPEN]** Do the 07, 11 and 16 two-way splits match the subgroups the user heard? Asked twice, never answered.
- **[OPEN]** Dropping the "zz" prefix from kept carts after review.
- **[OPEN]** Whether "+ höyge" really meant "0 höyge". Assumed, never contradicted.
- **[OPEN]** Whether to re-run the analysis after the user reviews more crates. The `REV = range(1, 46)` setting needs changing in the scripts.
- **Note:** the scratchpad scripts are probably gone: `review1/` (a2/a4/a6.py), `dist/` (trial.py, trial2.py), `seg/` (extract.py, compare.py; segment npy files), `purchased-crates/`, `split2/`, `cohesion/`. The scratchpad was later found empty, so the numbers above exist only here and in the session transcript.

---

## 2. Design D: fine-tuning or retraining for EDM, plus embedding arithmetic

### 2.1 User statements and answers

- **[USER]**, item 4 (quoted in section 0). Target genres: "techno, trance, house, breakbeat, drum and bass, etc."
- **[USER]**, the arithmetic request (quoted in section 0).
- **[USER]:** "The fifth research should be combined with the fourth change to see if the fine-tuning or retraining could be done in a way to better support the calculations."
- **[USER]**, the budget, hardware and licence answer: "D) local mac, include models with permissive licenses and training from scratch."
- **[USER]:** "I also wonder if fine-tuning and / or training a new model would produce results that would result in a higher confidence than what the model currently returns?"
- **[USER]:** "If I'd train a similar model from my collection using the Discogs data, how close would I likely get to the Discogs EffNet in terms of accuracy?"
- **[USER]:** asked how many tracks are in the local music folder; the answer is below.
- **[USER]:** "How long would the training take and how much would it cost if I would do it in a cloud service?"
- **[USER]:** "Is there any way around the Discogs-Effnet license e.g. by allowing the users to provide the model / "inference" separately?"
- **[USER]:** "Does the attribution need to be on the site or just in the published source code?"
- **[USER]:** "If I do not include the weights in the repo, but instead somehow automate the installation, would I then need to include the attribution or other documentation in the repo / service?"
- **[USER]:** "Would it be better to implement the downloader or to keep the weights and other related files in the repo and add the attribution?"
- **[USER]:** "yes, add the attribution README". **[USER]:** "merge the change to master and push".
- **[USER]:** "Are the B and D spec'd? I would be interested in running B." The user chose B, not D.
- **[USER]:** "Are the A and D plans documented somewhere? Do you have enough information to generate the specs?"

### 2.2 Decisions agreed for D

| # | Decision |
|---|---|
| D-1 | Embedding arithmetic is merged into D. D is judged partly on whether arithmetic works better after fine-tuning or retraining. |
| D-2 | D comes after B. |
| D-3 | **Compute: local Mac.** Include models with **permissive licences** and **training from scratch**. |
| D-4 | The Discogs-EffNet weights stay in the repo, with an attribution README rather than a downloader, which is deferred until D adds more models. The README `analyser/models/README.md` was committed as `16c58b9bb` and fast-forwarded to master (`4da4d89cb..16c58b9bb`). |
| D-5 | The assistant will add these to design D: the scaling test, the cloud estimates and benchmark step, a "data and licence constraints" section whose first task is checking the Beatport download licence and other stores' terms, and a downloader with pinned checksums once more models are added. These are assistant commitments the user didn't object to; no design doc exists. |

The cloud cost estimates were informational. The user didn't choose cloud; the decision remains "local Mac".

### 2.3 Measured or verified facts for D

- **Learned-projection test**, a cheap stand-in for fine-tuning. Trained on some crates and tested on held-out crates; AUC of kept above removed:

  | Variant | AUC |
  |---|---|
  | Baseline cosine | 0.712 |
  | **LDA projection, 32 dimensions** | **0.728** |
  | LDA + Rocchio b=0.5 | 0.765 |
  | Learned per-dimension weights | 0.574 (overfits) |

  - Reported as "0.71 → 0.73 alone, 0.77 with push-away".
  - Conclusion stated: "learning from your crates helps a little and adds to the push-away".
- **Push-away** strength curve: see A 1.3. The optimum is around b=0.75 (0.768). It collapses at b ≥ 1.0. C shipped PUSH_STRENGTH = 0.5.
- **Segment median** gives about +0.02 and would be adopted only when re-embedding, for example with a D model.
- **Training-data size of Discogs-EffNet** is confirmed from the model's metadata: "Discogs-4M (unreleased)", 4M full tracks, 3.3M of them used.
- **Local library:** about 7,000 unique full tracks in the local music folder, about twice the Purchased cart, as full tracks.
- **Licence file inconsistency**: MTG's model LICENSE heading says "NonCommercial-NoDerivatives 4.0" but links the BY-NC-**SA** legal code. Essentia's docs say BY-NC-SA. Under ND you could fine-tune privately but not share the result. Noted in the README.
- **Model provenance**: the `.pb` (16 MB) was committed accidentally in `a1252a6f5` ("feat(auth): gate OIDC handoff on PREVIEW_ENV=true").
- **The repo has no LICENSE file**.

### 2.4 Assistant answers and estimates (informational, not decisions)

**"Higher confidence?"**:
- Scores are unscaled similarities, not confidences. The right measure is separation, using the same kept/removed AUC.
- Full fine-tuning has few labels (about 2,000 kept and 287 removed) and risks memorising the crates. Pair them with Beatport genre and sub-genre labels across about 110k tracks.
- D should report the same AUC, so the comparison is direct.
- Training from scratch is unlikely to beat EffNet; its value is the licence.
- There is likely a ceiling from what a 2-minute preview captures.

**From-scratch accuracy vs. EffNet**:
- Data gap: about 3–4M full tracks against about 110k 2-minute previews, roughly 30× fewer.
- **General music:** clearly worse.
- **The user's EDM crates:** "potentially close", because all capacity goes to EDM. Unknown until measured.
- **Fine-tuning EffNet** beats both on the odds but stays CC BY-NC-SA.
- **Labels:**
  - Discogs labels require matching fomoplayer tracks to Discogs releases. Coverage is likely weaker for digital-only Beatport releases; D should measure it first.
  - Beatport genres and sub-genres are the fallback labels.
- **On the Mac:** EfficientNet-B0 on 110k previews takes days rather than weeks; fine-tuning is faster.
- **[PROPOSED] scaling test:** train from scratch on 10k, 30k and 110k tracks and plot the crate score against data size.
  - Still climbing steeply: more data is needed.
  - Flattened below EffNet: abandon from-scratch training.

**Cloud time and cost**. These are estimates, not measurements. A one-hour benchmark (about $2) was proposed.
- **Workload:** EfficientNet-B0, about 5M parameters, 2 s patches; about 110k previews × 60 patches ≈ 6–7M patches per epoch; 30–100 epochs from scratch, 3–10 for fine-tuning.
- **Time per run:**

  | Hardware | One epoch | From scratch | Fine-tuning |
  |---|---|---|---|
  | A100 | ~12 min | 6–20 h | 1–2 h |
  | / A10G | ~35 min | 20–60 h | 2–6 h |
  | Mac (Apple GPU) | ~1–2 h | 2–7 days | 5–20 h |

- **Cost:**
  - marketplaces (RunPod, Lambda, Vast.ai), A100 about $1.2–2/h: $10–40 per from-scratch run, $50–400 for the project (5–10 runs plus the scaling test);
  - big cloud, A100 about $3–4/h: $25–80 per run, $150–800 for the project;
  - fine-tuning: $2–10 per run, $20–80 total;
  - storage about $10–20 a month.
- **Data:** about 160 GB of previews plus about 160 GB of spectrograms. The local library adds 30–40 GB.
- **[PROPOSED] practical route:**
  1. Run the scaling test and fine-tuning on the Mac.
  2. Rent an A100 only for the full from-scratch runs, once the scaling test justifies them.
  3. Keep the audio on private storage.

**Attribution**:
- Attribution is required where the weights are shared: the public repo and any published Docker image. The site needs none, though a credit is courteous. MTG asks for the ISMIR 2022 paper citation.
- A downloader that fetches from MTG's URL would remove the attribution duty. But the `.pb` is already in public history, and the NC term still applies to server use.
- **Recommended and accepted:** keep the weights plus a README. Reasons: the stored embeddings are tied to this exact file; no dependency on `essentia.upf.edu`; 16 MB is small.
- **README contents:**
  - authors Alonso-Jiménez, Serra and Bogdanov (MTG/UPF);
  - © UPF 2019–2021;
  - the source URL;
  - CC BY-NC-SA 4.0 with link;
  - no modifications;
  - non-commercial only, plus MTG's contact;
  - no warranty;
  - the ISMIR 2022 citation;
  - the ND/SA mismatch note.

**Arithmetic**:
- **[PROPOSED] method:**
  - perturbation-pair directions from B, checked for consistency across tracks and for finding real tracks that differ the same way;
  - real-world directions from remix vs. original, a label across eras, or genre centroid differences;
  - a "more like this, less like that" control in C if arithmetic works.
- **Training data for D** ("kept/removed pairs"):
  - from the revised design A: kept and removed tracks become "belongs with" and "doesn't belong with" pairs for fine-tuning.
  - the first design A section's default: Beatport genres and sub-genres, carts and miss marks as labels.
  - from the "higher confidence" answer: pair the few crate labels with Beatport genres across about 110k tracks.
- **B findings fed into D**:
  - The model is drum- and tempo-led and nearly blind to key and melody. "Similar melody" or "similar vibe, different drums" therefore needs per-stem embeddings or a fine-tune.
  - Per-stem embeddings already exist for 200 tracks. **[PROPOSED]** A quick test of whether "other"-stem neighbours make sense, to see if arithmetic on stems is worth pursuing before any training.
  - Any training augmentation must avoid Rubber Band R3, whose stretch artefacts move embeddings by about 0.055 (median over 300 tracks) even at a 0.1% tempo change. Use sox WSOLA.
  - The model only hears below 8 kHz (16 kHz sampling).
  - The literature says the multi model was trained contrastively on track, release, artist and label pairs, with artist weight 0.6 and no augmentation. Tempo stays in the embedding.
  - **[PROPOSED]** Step 1 first: check how production's preview embeddings compare with full tracks. A fixed-position 30 s keeps about 6.4 of 10 full-track neighbours; the most typical 30 s keeps about 8.1. That result "decides whether D is about fixing the input or about changing the model".

### 2.5 How far D got

- **No brainstorming design section for D was ever presented.** D's content exists only as answers to the user's questions plus the question list.
- No approach options were offered and no design doc or OpenSpec change exists.
- The only concrete D output is the attribution README on master (`16c58b9bb`).
- The intended path is brainstorm-to-openspec, with B's findings as input.

### 2.6 Open questions for D

- **[ANSWERED 2026-10-17] Is Fomo Player commercial, or will it be?** No: it is not commercial, and the user does not expect it to become a business because it relies on data scraped from the stores.
- **[OPEN]** Whether to contact MTG about a commercial licence, which would also settle the ND vs. SA question.
- **[OPEN]** Which training audio is allowed to be used (see the private legal notes).
- **[OPEN]** Which training audio to use:
  - Beatport previews;
  - the user's own purchased tracks (about 3,648 in Purchased);
  - the local library (about 7,046 tracks; terms vary by store);
  - the user's 320 kbps MP3s offered for B.
- **[OPEN]** Label source: matching to the Discogs CC0 dump (coverage unknown, to be measured first) vs. Beatport genres vs. crate kept/removed pairs.
- **[OPEN]** Which permissive models to benchmark. The list is from memory and needs verifying.
- **[OPEN]** Whether D stops at a written plan or includes actual training runs. The assumption was never confirmed. The user's "local mac" answer suggests runs on the Mac.
- **[OPEN]** Whether to adopt median pooling when re-embedding.
- **[OPEN]** Whether to run the "preview vs. full track" production check (B next-step 1) before speccing D.
- **[OPEN]** How arithmetic success is measured. Only the outline above exists, with no metric agreed.
- **[OPEN]** Whether to verify the cost and time estimates with the proposed one-hour (about $2) benchmark.

---

## 3. Completeness summary

- **A** has rich material:
  - decisions A-1 to A-11;
  - full measurements: cohesion, removal AUC 0.69, direction-aware trials, segment pooling;
  - two presented design sections.

  But **no explicit approval** of any design section, no design doc and no OpenSpec change. Brainstorming stalled at "Does this revised section look right?". Ground truth is only partly reviewed: crates 1–45 and 55–57 are done; 46–62, 267–276 and 277–282 are pending.
- **D** has only Q&A material:
  - decisions D-1 to D-5;
  - a full set of informational answers on cost, licences, attribution and accuracy;
  - one measured stand-in for fine-tuning (LDA 0.71 → 0.73, 0.77 with push-away);
  - B's findings as input.

  There was **no design section, no approach options and no spec**. The key blocker question, whether Fomo Player is commercial, was answered on 2026-10-17: it is not.
