package com.nextgen

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList

class NextGenIMDbProvider : NextGenProvider() {
    override var name = "NextGenIMDb"
    override val apiName = "NextGenIMDb"
    override var mainUrl = "https://www.imdb.com"
    override val useMetaLoadResponse = false
    override val mainPage: List<MainPageData>
        get() = NextGenIMDbApi.activeRows()

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        NextGenIMDbApi.page(this, page, request)

    override suspend fun search(query: String): List<SearchResponse>? =
        NextGenIMDbApi.search(this, query)

    override suspend fun search(query: String, page: Int): SearchResponseList? =
        newSearchResponseList(if (page <= 1) NextGenIMDbApi.search(this, query) else emptyList(), hasNext = false)

    override suspend fun load(url: String): LoadResponse? =
        with(NextGenIMDbDetails) { loadIMDb(url) }
}
