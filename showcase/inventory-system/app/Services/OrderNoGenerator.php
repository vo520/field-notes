<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * 单据号生成器
 * 格式：{前缀}YYYYMMDD####（如 PO20250115001）
 * 使用 Redis/缓存自增，按日+前缀计数，并发安全
 */
class OrderNoGenerator
{
    public static function generate(string $prefix): string
    {
        $date = date('Ymd');
        $key = "order_no:{$prefix}:{$date}";
        // add 只在键不存在时建 0（带当日 TTL），不会覆盖并发请求已递增过的值
        Cache::add($key, 0, now()->endOfDay());
        $seq = Cache::increment($key);
        return $prefix . $date . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }

    public static function purchase(): string  { return self::generate(config('inventory.order_prefix.purchase', 'PO')); }
    public static function sales(): string     { return self::generate(config('inventory.order_prefix.sales', 'SO')); }
    public static function transfer(): string  { return self::generate(config('inventory.order_prefix.transfer', 'TR')); }
    public static function stocktake(): string { return self::generate(config('inventory.order_prefix.stocktake', 'ST')); }
    public static function stockIn(): string   { return self::generate(config('inventory.order_prefix.stock_in', 'IN')); }
    public static function stockOut(): string  { return self::generate(config('inventory.order_prefix.stock_out', 'OUT')); }
    public static function payment(): string   { return self::generate('PAY'); }
}
