import { db } from '../db';
import { transactionsTable } from '../db/schema';
import { type SearchTransactionsInput, type PaginatedTransactions } from '../schema';
import { eq, gte, lte, and, or, ilike, desc, asc, count, type SQL } from 'drizzle-orm';

export const searchTransactions = async (input: SearchTransactionsInput): Promise<PaginatedTransactions> => {
  try {
    // Calculate offset for pagination
    const offset = (input.page - 1) * input.limit;

    // Collect all filter conditions
    const conditions: SQL<unknown>[] = [];

    // Text search in description and vendor_name (case-insensitive)
    if (input.search_term) {
      const searchConditions = [
        ilike(transactionsTable.description, `%${input.search_term}%`),
        ilike(transactionsTable.vendor_name, `%${input.search_term}%`)
      ];
      // Filter out any undefined values and create OR condition
      const validSearchConditions = searchConditions.filter((cond): cond is SQL<unknown> => cond !== undefined);
      if (validSearchConditions.length > 0) {
        conditions.push(or(...validSearchConditions)!);
      }
    }

    // Date range filtering
    if (input.date_from) {
      conditions.push(gte(transactionsTable.transaction_date, input.date_from));
    }

    if (input.date_to) {
      conditions.push(lte(transactionsTable.transaction_date, input.date_to));
    }

    // Amount range filtering
    if (input.min_amount !== undefined) {
      conditions.push(gte(transactionsTable.amount, input.min_amount.toString()));
    }

    if (input.max_amount !== undefined) {
      conditions.push(lte(transactionsTable.amount, input.max_amount.toString()));
    }

    // Exact match filters
    if (input.account_number) {
      conditions.push(eq(transactionsTable.account_number, input.account_number));
    }

    if (input.vendor_name) {
      conditions.push(eq(transactionsTable.vendor_name, input.vendor_name));
    }

    if (input.transaction_type) {
      conditions.push(eq(transactionsTable.transaction_type, input.transaction_type));
    }

    // Build the query step by step
    let baseQuery = db.select().from(transactionsTable);

    // Apply where clause if we have conditions
    let queryWithWhere = conditions.length > 0 
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;

    // Apply sorting
    let queryWithOrder;
    if (input.sort_order === 'desc') {
      if (input.sort_by === 'transaction_date') {
        queryWithOrder = queryWithWhere.orderBy(desc(transactionsTable.transaction_date));
      } else if (input.sort_by === 'amount') {
        queryWithOrder = queryWithWhere.orderBy(desc(transactionsTable.amount));
      } else if (input.sort_by === 'description') {
        queryWithOrder = queryWithWhere.orderBy(desc(transactionsTable.description));
      } else if (input.sort_by === 'vendor_name') {
        queryWithOrder = queryWithWhere.orderBy(desc(transactionsTable.vendor_name));
      } else {
        queryWithOrder = queryWithWhere.orderBy(desc(transactionsTable.transaction_date));
      }
    } else {
      if (input.sort_by === 'transaction_date') {
        queryWithOrder = queryWithWhere.orderBy(asc(transactionsTable.transaction_date));
      } else if (input.sort_by === 'amount') {
        queryWithOrder = queryWithWhere.orderBy(asc(transactionsTable.amount));
      } else if (input.sort_by === 'description') {
        queryWithOrder = queryWithWhere.orderBy(asc(transactionsTable.description));
      } else if (input.sort_by === 'vendor_name') {
        queryWithOrder = queryWithWhere.orderBy(asc(transactionsTable.vendor_name));
      } else {
        queryWithOrder = queryWithWhere.orderBy(asc(transactionsTable.transaction_date));
      }
    }

    // Apply pagination and execute
    const finalQuery = queryWithOrder.limit(input.limit).offset(offset);
    const results = await finalQuery.execute();

    // Build count query with same conditions
    let countBaseQuery = db.select({ count: count() }).from(transactionsTable);
    
    const countQueryWithWhere = conditions.length > 0 
      ? countBaseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : countBaseQuery;

    const countResult = await countQueryWithWhere.execute();
    const totalCount = countResult[0].count;

    // Convert numeric fields and prepare response
    const transactions = results.map(transaction => ({
      ...transaction,
      amount: parseFloat(transaction.amount) // Convert numeric string to number
    }));

    const totalPages = Math.ceil(totalCount / input.limit);

    return {
      transactions,
      total_count: totalCount,
      page: input.page,
      limit: input.limit,
      total_pages: totalPages
    };
  } catch (error) {
    console.error('Transaction search failed:', error);
    throw error;
  }
};