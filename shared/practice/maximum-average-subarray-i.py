class Solution:
    def findMaxAverage(self, nums: List[int], k: int) -> float:
        window = sum(nums[:k])
        best = window
        for right in range(k, len(nums)):
            left = right - k
            window += nums[right] - nums[left]
            best = max(best, window)
        return best / k
