class Solution:
    def rob(self, nums: List[int]) -> int:
        dp = [0] * len(nums)
        dp[0] = nums[0]
        for i in range(1, len(nums)):
            take = nums[i] + (dp[i - 2] if i >= 2 else 0)
            dp[i] = max(dp[i - 1], take)
        return dp[-1]
