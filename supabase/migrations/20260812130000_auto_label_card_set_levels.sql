-- Backfill untagged collections using the established lesson ranges. Explicit
-- N5/N4/N3 text in a legacy name takes priority over the numeric range.
with detected as (
  select
    id,
    case
      when name ~* '\mN5\M' then 'n5'
      when name ~* '\mN4\M' then 'n4'
      when name ~* '\mN3\M' then 'n3'
      when ((regexp_match(name, '(?i)\mlesson\s*#?\s*([0-9]+)\M'))[1])::integer between 1 and 25 then 'n5'
      when ((regexp_match(name, '(?i)\mlesson\s*#?\s*([0-9]+)\M'))[1])::integer between 26 and 50 then 'n4'
      else null
    end as detected_level
  from public.card_sets
  where jlpt_level is null
)
update public.card_sets as sets
set jlpt_level = detected.detected_level
from detected
where sets.id = detected.id
  and detected.detected_level is not null;
