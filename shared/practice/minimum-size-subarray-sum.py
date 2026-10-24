class Solution:
    def minSubArrayLen(self, target: int, nums: List[int]) -> int:
        left = 0
        window = 0
        best = len(nums) + 1
        for right in range(len(nums)):
            window += nums[right]
            while window >= target:
                best = min(best, right - left + 1)
                window -= nums[left]
                left += 1
        return best if best <= len(nums) else 0
