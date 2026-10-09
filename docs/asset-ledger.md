# Asset ledger (paid generations)

Budgets agreed with the owner: **Higgsfield ≤ 35 credits** (balance must stay ≥ 35 of 70) and **Krea ≤ 1000 credits** (of ~2000).

## Higgsfield

| #   | Date       | Model                                          | Purpose                      | Credits | Running total | Balance after |
| --- | ---------- | ---------------------------------------------- | ---------------------------- | ------- | ------------- | ------------- |
| 1   | 2026-10-02 | gpt_image_2_5 (medium, ×2)                     | Ežo concept art (A-pose)     | 1.0     | 1.0           | 69            |
| 2   | 2026-10-02 | tripo_h3_1_image_to_3d (detailed texture, PBR) | Ežo 3D mesh                  | 12      | 13            | 57            |
| 3   | 2026-10-02 | 3d_rigging                                     | Ežo humanoid rig (24 joints) | 5       | 18            | 52            |
| 4   | 2026-10-02 | gpt_image_2_5 (medium)                         | Vierka concept art           | 0.5     | 18.5          | 51.5          |
| 5   | 2026-10-02 | tripo_h3_1_image_to_3d (standard, PBR)         | Vierka 3D mesh               | 9       | 27.5          | 42.5          |
| 6   | 2026-10-02 | 3d_rigging                                     | Vierka rig                   | 5       | 32.5          | 37.5          |

Remaining Higgsfield allowance: **2.5 credits**.

2026-10-03: checked Higgsfield speech pricing for Ežo's lines (0.15 credits per started 50 characters). Brian isn't a Higgsfield voice; a test submission with his ElevenLabs id was rejected ("Voice not found") at no charge. The owner chose not to use Higgsfield for voices. Balance unchanged at 37.5.

## Krea

Krea's MCP doesn't report what a job costs.

| #   | Date       | Model                      | Purpose                                   | Cost    |
| --- | ---------- | -------------------------- | ----------------------------------------- | ------- |
| 1   | 2026-10-02 | krea-2/large image         | Jano concept (seated regular)             | unknown |
| 2   | 2026-10-02 | tripo/h3.1 image→3D        | Jano mesh                                 | unknown |
| 3   | 2026-10-02 | krea-2/large image         | Fero concept                              | unknown |
| 4   | 2026-10-02 | tripo/h3.1 image→3D        | Fero mesh                                 | unknown |
| 5–7 | 2026-10-02 | elevenlabs/tts (eleven_v4) | Ežo voice auditions A/B/C (one line each) | unknown |

After these 7 jobs the owner reported a Krea balance of **0**, far past the agreed limit of 1000. Krea is no longer used for this project. In the game, only audition B (Brian, the owner's pick) is used: it is cut into two lines, `e_intro2` and `e_intro3`. All other lines are subtitles only.

2026-10-05: the two voice lines also ship as Opus (`.ogg`, converted locally with ffmpeg from the MP3s; no credits). Linux browsers without the proprietary codec library (e.g. Vivaldi without its ffmpeg package) cannot decode MP3. Vierka's apron, missing from her generated model, is modelled procedurally in the pub. No Higgsfield or Krea credits were spent on these fixes.

2026-10-06 to 2026-10-09: no credits spent and no generated assets added. The toilet fixtures, Vierka's key ring and all other changes are built in code. Balances were not re-checked.
