-- Allow every transaction type the app uses (dividend/interest were added in code earlier;
-- split and bonus are new). Drops whatever check constraint exists on the column first.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'holding_transactions' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%transaction_type%'
  loop
    execute format('alter table holding_transactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table holding_transactions
  add constraint holding_transactions_type_check
  check (transaction_type in ('buy', 'sell', 'dividend', 'interest', 'split', 'bonus'));
